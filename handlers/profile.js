const {
  UserProfile,
  Poll,
  Question,
  Connection,
  Conference,
  AccessCode,
  Message,
} = require("../database");
const {
  profileKeyboard,
  backKeyboard,
  conferenceKeyboard,
  pollKeyboard,
  adminKeyboard,
  adminMainKeyboard,
  mainKeyboard,
} = require("../utils/keyboards");
const { findMatches, calculateMatchScore } = require("../utils/matching");

const { Markup } = require("telegraf");
const QRCode = require("qrcode");

const profileHandler = (bot) => {
  // ============ START & CONFERENCE SELECTION ============
  bot.start(async (ctx) => {
    const startParams = ctx.message.text.split(" ")[1];

    // Handle QR code joins
    if (startParams && startParams.startsWith("join_")) {
      const [, conferenceCode, accessCode] = startParams.split("_");
      await handleJoinConference(ctx, conferenceCode, accessCode);
      return;
    }

    const welcomeMessage = `🎉 Добро пожаловать в бот для общения по конференциям, ${ctx.from.first_name}!

Я помогу вам связаться с другими участниками, принять участие в опросах и задать вопросы спикерам.

Для начала давайте настроим ваш профиль!`;

    await ctx.reply(welcomeMessage);

    // Check if user already has a profile
    const existingProfile = await UserProfile.findOne({
      telegramId: ctx.from.id,
    });
    if (existingProfile && existingProfile.conference) {
      // await ctx.reply(`✅ Вы уже зарегистрированы и присоединились к ${existingProfile.conference}`);
      await ctx.reply(
        `✅ Вы уже зарегистрированы и присоединились к ${existingProfile.conference}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🚪 Выйти из конференции",
              "leave_conference"
            ),
          ],
        ])
      );

      await showMainMenu(ctx);
      return;
    }
    // Create user profile if not exists
    if (!existingProfile) {
      await UserProfile.create({
        telegramId: ctx.from.id,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
        isActive: true,
        conference: null,
        isAdmin: false,
        interests: [],
        offerings: [],
        lookingFor: [],
        contacts: { phone: "", email: "", telegram: "", vkontakte: "" },
        photo: "",
      });
    }

    // Show conference selection
    await ctx.reply(
      "Пожалуйста, выберите одну из этих публичных конференций:",
      await conferenceKeyboard()
    );
  });

  // Conference selection
  bot.action(/conference_(.+)_(.+)/, async (ctx) => {
    const conference = ctx.match[1];
    const conferenceName = ctx.match[2];
    await ctx.answerCbQuery();
    console.log("Конференция выбрана:", conferenceName);

    if (!ctx.session) ctx.session = {};

    await UserProfile.findOneAndUpdate(
      { telegramId: ctx.from.id },
      {
        telegramId: ctx.from.id,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
        conference: conferenceName,
      },
      { upsert: true }
    );

    await ctx.reply(`✅ Вы выбрали ${conferenceName}`);
    await showMainMenu(ctx);
  });

  bot.action("leave_conference", async (ctx) => {
    try {
      // remove user from conference in DB
      await UserProfile.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { $set: { conference: "" } }
      );

      await ctx.editMessageText(
        "🚪 Вы покинули конференцию. Выберите одну из этих публичных конференций.",
        await conferenceKeyboard(ctx)
      );
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Ошибка при выходе из конференции.");
    }
  });

  // ============ PROFILE MANAGEMENT ============
  bot.hears("👤 Мой профиль", async (ctx) => {
    const profile = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!profile) {
      await ctx.reply(
        "Сначала настройте свой профиль. Используйте /start, чтобы начать."
      );
      return;
    }
    await showProfile(ctx, profile);
  });

  // Profile editing commands
  const profileActions = {
    "📸 Изменить фото": {
      waitingFor: "photo",
      message: "Пожалуйста, пришлите свою фотографию:",
    },

    "🎯 Изменить интересы": {
      waitingFor: "interests",
      message: "Перечислите интересы (через запятую):",
    },
    "💼 Изменить предложения": {
      waitingFor: "offerings",
      message: "Что вы можете предложить? (через запятую):",
    },
    "🔍 Изменить поиск": {
      waitingFor: "lookingFor",
      message: "Что вы ищете? (через запятую):",
    },
  };

  Object.entries(profileActions).forEach(
    ([action, { waitingFor, message }]) => {
      bot.hears(action, async (ctx) => {
        if (!ctx.session) ctx.session = {};
        ctx.session.waitingFor = waitingFor;
        await ctx.reply(message, backKeyboard());
      });
    }
  );

  // Edit contacts ========
  bot.hears("📞 Изменить контакты", async (ctx) => {
    await ctx.reply(
      "Выберите контакт для изменения:",
      Markup.inlineKeyboard([
        [Markup.button.callback("📱 Телефон", "edit_phone")],
        [Markup.button.callback("✉️ Email", "edit_email")],
        [Markup.button.callback("💬 Telegram", "edit_telegram")],
        [Markup.button.callback("🔗 Vkontakte", "edit_vkontakt")],
      ])
    );
  });

  bot.action("edit_phone", async (ctx) => {
    ctx.session.waitingFor = "phone";
    await ctx.reply("Введите новый номер телефона:");
  });

  bot.action("edit_email", async (ctx) => {
    ctx.session.waitingFor = "email";
    await ctx.reply("Введите новый Email:");
  });

  bot.action("edit_telegram", async (ctx) => {
    ctx.session.waitingFor = "telegram";
    await ctx.reply("Введите новый Telegram:");
  });

  bot.action("edit_vkontakt", async (ctx) => {
    ctx.session.waitingFor = "vkontakte";
    await ctx.reply("Введите новый Vkontakte:");
  });

  // ============ NETWORKING ============
  bot.hears("🔍 Найти людей", async (ctx) => {
    const userProfile = await UserProfile.findOne({ telegramId: ctx.from.id });

    if (!userProfile) {
      await ctx.reply("Сначала настройте свой профиль с помощью /start");
      return;
    }

    const matches = await findMatches(ctx.from.id, userProfile.conference);

    if (matches.length === 0) {
      await ctx.reply(
        "Подходящих пользователей пока не найдено. Зайдите позже!"
      );
      return;
    }

    // Sort by match score
    matches.sort((a, b) => {
      const scoreA = calculateMatchScore(userProfile, a);
      const scoreB = calculateMatchScore(userProfile, b);
      return scoreB - scoreA;
    });

    await ctx.reply(`Found ${matches.length} potential matches:`);

    for (const match of matches.slice(0, 10)) {
      // Show top 5 matches
      const matchScore = calculateMatchScore(userProfile, match);
      await showUserProfile(ctx, match, matchScore);
    }
  });

  bot.hears("🤝 Мои связи", async (ctx) => {
    const connections = await Connection.find({
      $or: [{ user1: ctx.from.id }, { user2: ctx.from.id }],
      status: "accepted",
    });

    if (connections.length === 0) {
      await ctx.reply("No connections yet.");
      return;
    }

    await ctx.reply(`Your connections (${connections.length}):`);
    for (const connection of connections) {
      const otherUserId =
        connection.user1 === ctx.from.id ? connection.user2 : connection.user1;
      const otherUser = await UserProfile.findOne({ telegramId: otherUserId });
      if (otherUser) {
        await ctx.reply(
          `✅ ${otherUser.firstName} ${otherUser.lastName || ""} (@${
            otherUser.username || "N/A"
          })`
        );
      }
    }
  });

  bot.hears("⭐ Избранные профили", async (ctx) => {
    const userProfile = await UserProfile.findOne({ telegramId: ctx.from.id });
    const featuredUsers = await UserProfile.find({
      telegramId: { $ne: ctx.from.id },
      conference: userProfile?.conference,
      isActive: true,
    }).limit(3);

    if (featuredUsers.length === 0) {
      await ctx.reply("No featured profiles yet.");
      return;
    }

    await ctx.reply("⭐ Featured Profiles:");
    for (const user of featuredUsers) {
      await showUserProfile(ctx, user);
    }
  });

  // ============ POLLS ============
  bot.hears("📊 Активные опросы", async (ctx) => {
    const userProfile = await UserProfile.findOne({ telegramId: ctx.from.id });
    const polls = await Poll.find({
      conference: userProfile?.conference,
      isActive: true,
    });

    if (polls.length === 0) {
      await ctx.reply("Нет активных опросов.");
      return;
    }

    for (const poll of polls) {
      await showPoll(ctx, poll);
    }
  });

  // ============ QUESTIONS ============
  bot.hears("❓ Спросите спикера", async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.waitingFor = "speaker_name";
    await ctx.reply("Введите имя спикера:");
  });

  // ============ BACK BUTTON ============
  bot.hears("⬅️ Вернуться на главную", async (ctx) => {
    if (ctx.session) {
      ctx.session.waitingFor = null;
      ctx.session.speakerName = null;
    }
    await showMainMenu(ctx);
  });

  // =========== Admin panel Start ===========
  bot.hears("🛠️ Панель администратора", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) {
      await ctx.reply("❌ Требуется доступ администратора");
      return;
    }
    await ctx.reply("Options", adminKeyboard());
  });

  // ============ CHAT ============
  bot.hears("💬 Мои чаты", async (ctx) => {
    const connections = await Connection.find({
      $or: [{ user1: ctx.from.id }, { user2: ctx.from.id }],
      status: "accepted",
    });

    if (connections.length === 0) {
      await ctx.reply("Нет активных чатов.");
      return;
    }

    for (const connection of connections) {
      const otherUserId =
        connection.user1 === ctx.from.id ? connection.user2 : connection.user1;
      const otherUser = await UserProfile.findOne({ telegramId: otherUserId });

      let message = `💬 Чат с ${otherUser.firstName}\n`;
      if (connection.lastMessage) {
        message += `Последний: ${connection.lastMessage.text.substring(
          0,
          30
        )}...\n`;
      }
      if (connection.unreadCount > 0) {
        message += `📨 ${connection.unreadCount} непрочитанных`;
      }

      await ctx.reply(
        message,
        Markup.inlineKeyboard([
          Markup.button.callback("Открытый чат", `open_chat_${otherUserId}`),
        ])
      );
    }
  });

  // ============ ADMIN FEATURES ============
  bot.command("admin", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) {
      await ctx.reply("❌ Требуется доступ администратора");
      return;
    }
    await ctx.reply("🛠️ Панель администратора", adminKeyboard());
  });

  bot.hears("📊 Создать опрос", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    ctx.session.waitingFor = "admin_poll_question";
    ctx.session.newPoll = { options: [], conference: user.conference };

    await ctx.reply("Введите вопрос опроса:");
  });

  bot.hears("🏢 Создать конференцию", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    ctx.session.waitingFor = "admin_conference_name";
    await ctx.reply("Введите название конференции:");
  });

  // bot.hears("🔑 Generate QR Code", async (ctx) => {
  //   const user = await UserProfile.findOne({ telegramId: ctx.from.id });
  //   if (!user || !user.isAdmin) return;

  //   await generateQRCode(ctx);
  // });

  bot.hears("🔑 Сгенерировать QR-код", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    // 1. Get all conferences
    const conferences = await Conference.find();

    if (conferences.length === 0) {
      return ctx.reply("❌ Конференции не найдены.");
    }

    // 2. Show them as inline buttons
    const buttons = conferences.map((c) => [
      Markup.button.callback(c.name, `generate_qr_${c._id}`),
    ]);

    await ctx.reply("📌 Выберите конференцию:", Markup.inlineKeyboard(buttons));
  });

  bot.hears("📋 Управление вопросами", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    const questions = await Question.find({
      conference: user.conference,
      isAnswered: false,
    }).limit(10);

    if (questions.length === 0) {
      await ctx.reply("Нет неотвеченных вопросов.");
      return;
    }

    for (const question of questions) {
      await ctx.reply(
        `❓ От: ${question.askedByName}\nК:${question.speaker}\Вопрос: ${question.question}`,
        Markup.inlineKeyboard([
          Markup.button.callback("Отвечать", `admin_answer_${question._id}`),
        ])
      );
    }
  });

  bot.hears("📋 Список опросов", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    const pollsList = await Poll.find({
      isActive: true,
      conference: user.conference,
    });

    if (!pollsList || pollsList.length === 0) {
      await ctx.reply("Нет доступных опросов.");
      return;
    }

    for (const poll of pollsList) {
      const optionsText = poll.options
        .map((cVal, idx) => `• ${cVal.text}(${cVal.votes})`)
        .join("\n");

      await ctx.reply(
        `Вопрос: ${poll.question}\n` +
          `Конференция: ${poll.conference}\n\n` +
          `Параметры:\n${optionsText}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✏️ Редактировать", `poll_edit_${poll._id}`),
            Markup.button.callback("🗑 Удалить", `poll_delete_${poll._id}`),
          ],
        ])
      );
    }
  });

  bot.hears("📋 Список конференций", async (ctx) => {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    const conferenceList = await Conference.find();

    if (!conferenceList || conferenceList.length === 0) {
      await ctx.reply("No conferences avaible.");
      return;
    }

    for (const conference of conferenceList) {
      await ctx.reply(
        `Name: ${conference.name}\n` +
          `IsPublic: ${conference.isPublic}\n\n` +
          `Code:${conference.code}\n` +
          `Is Active: ${conference.isActive}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✏️ Edit",
              `conferenceList_edit_${conference._id}`
            ),
            Markup.button.callback(
              "🗑 Delete",
              `conferenceList_delete_${conference._id}`
            ),
            conference.isActive
              ? Markup.button.callback(
                  "🚫 Deactivate",
                  `conferenceList_deactivate_${conference._id}`
                )
              : Markup.button.callback(
                  "✅ Activate",
                  `conferenceList_activate_${conference._id}`
                ),
          ],
        ])
      );
    }
  });

  // ============ QR CODE HANDLING ============
  async function generateQRCode(ctx, conferenceId) {
    try {
      const user = await UserProfile.findOne({ telegramId: ctx.from.id });
      const conference = await Conference.findOne({ _id: conferenceId });

      if (!conference) {
        await ctx.reply("❌ Конференция не найдена");
        return;
      }

      const accessCode = new AccessCode({
        conference: conference.code,
        code: generateAccessCode(),
        createdBy: ctx.from.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await accessCode.save();

      const qrData = `https://t.me/${ctx.botInfo.username}?start=join_${conference.code}_${accessCode.code}`;
      const qrImage = await QRCode.toBuffer(qrData);

      await ctx.replyWithPhoto(
        { source: qrImage },
        {
          caption: `📲 Присоединиться ${conference.name}\nКод: ${
            accessCode.code
          }\nИстекает: ${accessCode.expiresAt.toLocaleDateString()}`,
        }
      );
    } catch (error) {
      console.error("QR code error:", error);
      await ctx.reply("❌ Ошибка генерации QR-кода");
    }
  }

  async function handleJoinConference(ctx, conferenceCode, accessCode) {
    try {
      const code = await AccessCode.findOne({
        code: accessCode,
        isUsed: false,
      });
      if (!code || code.conference !== conferenceCode) {
        await ctx.reply("❌ Неверный код доступа");
        return;
      }

      const conference = await Conference.findOne({ code: conferenceCode });
      if (!conference) {
        await ctx.reply("❌ Конференция не найдена");
        return;
      }

      await UserProfile.findOneAndUpdate(
        { telegramId: ctx.from.id },
        {
          telegramId: ctx.from.id,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          conference: conference.name,
        },
        { upsert: true }
      );

      code.isUsed = true;
      code.usedBy = ctx.from.id;
      await code.save();

      await ctx.reply(`✅ Присоединился ${conference.name}!`);
      await showMainMenu(ctx);
    } catch (error) {
      console.error("Join error:", error);
      await ctx.reply("❌ Ошибка присоединения к конференции");
    }
  }

  // ============ TEXT HANDLER ============

  bot.on("text", async (ctx) => {
    if (!ctx.session || !ctx.session.waitingFor) return;

    const text = ctx.message.text;
    const waitingFor = ctx.session.waitingFor;

    if (text === "⬅️ Вернуться на главную") {
      ctx.session.waitingFor = null;
      ctx.session.chatWith = null;
      await showMainMenu(ctx);
      return;
    }

    // Profile editing
    else if (["interests", "offerings", "lookingFor","phone", "email", "telegram", "vkontakte"].includes(waitingFor)) {
      await handleProfileInput(ctx, waitingFor, text);
    }
    // Questions
    else if (waitingFor === "speaker_name") {
      ctx.session.speakerName = text;
      ctx.session.waitingFor = "question";
      await ctx.reply("Теперь введите свой вопрос:");
    } else if (waitingFor === "question") {
      await handleQuestionInput(ctx, text);
    }
    // Admin features
    else if (waitingFor === "admin_poll_question") {
      ctx.session.newPoll.question = ctx.message.text;
      ctx.session.waitingFor = "create_poll_option";

      await ctx.reply("➕ Теперь отправьте мне первый вариант текста:");
      // await handleAdminPoll(ctx, text);
    } else if (waitingFor === "admin_conference_name") {
      await handleAdminConference(ctx, text);
    } else if (ctx.session?.waitingFor === "create_poll_option") {
      const newOption = ctx.message.text;
      ctx.session.newPoll.options.push({ text: newOption });

      await ctx.reply(
        "✅ Вариант добавлен.\nХотите добавить еще один вариант?",
        {
          ...Markup.inlineKeyboard(
            ctx.session.newPoll.options.length < 5
              ? [
                  [Markup.button.callback("➕ Да", "add_more_option")],
                  [
                    Markup.button.callback(
                      "✅ Заканчивать",
                      "finish_poll_creation"
                    ),
                  ],
                ]
              : [
                  [
                    Markup.button.callback(
                      "✅ Заканчивать",
                      "finish_poll_creation"
                    ),
                  ],
                ]
          ),
        }
      );
    }

    // Chat
    else if (waitingFor === "chat_message" && ctx.session.chatWith) {
      if (ctx.message.text === "/cancel") {
        ctx.session.waitingFor = null;
        ctx.session.chatWith = null;
        await ctx.reply("Чат отменен.");
        return;
      }
      await sendChatMessage(ctx, ctx.session.chatWith, text);
    }

    // Poll editing
    else if (waitingFor === "edit_poll_question") {
      const pollId = ctx.session.editPollId;
      const newQuestion = ctx.message.text;

      await Poll.findByIdAndUpdate(pollId, { question: newQuestion });

      ctx.session.waitingFor = null;
      ctx.session.editPollId = null;

      await ctx.reply("✅ Опрос успешно обновлен!");
    }

    // Conference editing
    else if (waitingFor === "edit_conference_name") {
      const conferenceId = ctx.session.editConferenceId;
      const newName = ctx.message.text;
      await Conference.findByIdAndUpdate(conferenceId, { name: newName });
      ctx.session.waitingFor = null;
      ctx.session.editConferenceId = null;
      await ctx.reply("✅ Название конференции успешно обновлено!");
    }

    // Handle poll question edit
    else if (waitingFor === "edit_poll_question") {
      const pollId = ctx.session.editPollId;
      const newQuestion = ctx.message.text;

      await Poll.findByIdAndUpdate(pollId, { question: newQuestion });

      ctx.session.waitingFor = null;
      ctx.session.editPollId = null;

      await ctx.reply("✅ Вопрос опроса обновлен!");
    }

    // Handle adding new poll option
    else if (waitingFor === "add_poll_option") {
      const pollId = ctx.session.editPollId;
      const newOption = ctx.message.text;

      await Poll.findByIdAndUpdate(pollId, {
        $push: { options: { text: newOption } },
      });

      ctx.session.waitingFor = null;
      ctx.session.editPollId = null;

      await ctx.reply("✅ Опция успешно добавлена!");
    }

    // Handle choosing option number to edit
    else if (waitingFor === "edit_option_text") {
      const pollId = ctx.session.editPollId;
      const optionIndex = ctx.session.optionIndex;
      const newText = ctx.message.text;

      const poll = await Poll.findById(pollId);
      poll.options[optionIndex].text = newText;
      await poll.save();

      ctx.session.waitingFor = null;
      ctx.session.optionIndex = null;
      ctx.session.editPollId = null;

      await ctx.reply("✅ Опция успешно обновлена!");
    }

    // answering questions
    else if (waitingFor.match(/^adminQuest_answer_(\w+)$/)) {
      const match = waitingFor.match(/^adminQuest_answer_(\w+)$/);

      const questionId = match[1];
      const answerText = ctx.message.text;

      try {
        const question = await Question.findById(questionId);
        if (!question) {
          await ctx.reply("❌ Вопрос не найден.");
          ctx.session.waitingFor = null;
          return;
        }

        // Save answer in DB
        question.answer = answerText;
        question.answeredBy = ctx.from.id;
        question.isAnswered = true;
        await question.save();

        // Notify the admin
        await ctx.reply("✅ Ответ успешно сохранен!");

        // Optionally notify the user who asked the question
        if (question.askedBy) {
          try {
            await ctx.telegram.sendMessage(
              question.askedBy,
              `❓ *Ваш вопрос:*\n${question.question}\n\n💡 *Ответ:*\n${answerText}`,
              { parse_mode: "Markdown" }
            );
          } catch (err) {
            console.error("Failed to notify user:", err);
          }
        }
      } catch (err) {
        console.error("Answer save error:", err);
        await ctx.reply("❌ Не удалось сохранить ответ..");
      }

      ctx.session.waitingFor = null;
    }
  });

  // ============ ACTION HANDLERS ============
  bot.action(/connect_(\d+)/, async (ctx) => {
    const targetUserId = parseInt(ctx.match[1]);
    await handleConnection(ctx, targetUserId);
  });

  bot.action(/open_chat_(\d+)/, async (ctx) => {
    const targetUserId = parseInt(ctx.match[1]);
    ctx.session.chatWith = targetUserId;
    ctx.session.waitingFor = "chat_message";
    await ctx.reply("Введите ваше сообщение (/cancel для остановки):");
  });

  bot.action(/admin_answer_(\w+)/, async (ctx) => {
    const questionId = ctx.match[1];
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;

    ctx.session.waitingFor = `adminQuest_answer_${questionId}`;
    await ctx.reply("Введите свой ответ:");
  });

  bot.action(/admin_deleteQeustion_(\w+)/, async (ctx) => {
    const questionId = ctx.match[1];
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });
    if (!user || !user.isAdmin) return;
    await Question.findByIdAndDelete(questionId)
      .then(async () => {
        await ctx.answerCbQuery("Вопрос удален ✅");
        await ctx.editMessageText("❌ Этот вопрос был удален..");
      })
      .catch(async (err) => {
        console.error("Ошибка удаления вопроса:", err);
        await ctx.answerCbQuery("❌ Ошибка при удалении вопроса");
      });
  });

  bot.action(/vote_(\w+)_(\d+)/, async (ctx) => {
    const pollId = ctx.match[1];
    const optionIndex = parseInt(ctx.match[2]);
    await handleVote(ctx, pollId, optionIndex);
  });

  bot.action(/generate_qr_(\w+)/, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("generate_qr_")) {
      const conferenceId = data.replace("generate_qr_", "");

      await ctx.answerCbQuery(); // remove loading spinner

      // Call your QR code generator with conferenceId
      await generateQRCode(ctx, conferenceId);
    }
  });

  // Admin poll management
  bot.action(/poll_delete_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    await Poll.findByIdAndDelete(pollId);
    await ctx.answerCbQuery("Опрос удален ✅");
    await ctx.editMessageText("❌ Этот опрос был удален.");
  });

  // Handle poll edit (step 1: ask for new question)
  bot.action(/poll_edit_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    ctx.session.editPollId = pollId;

    await ctx.answerCbQuery();
    await ctx.reply(
      "⚙️ Что вы хотите редактировать??",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✏️ Редактировать вопрос",
            `edit_question_${pollId}`
          ),
        ],
        [
          Markup.button.callback(
            "📝 Параметры редактирования",
            `edit_options_${pollId}`
          ),
        ],
        [Markup.button.callback("➕ Добавить вариант", `add_option_${pollId}`)],
      ])
    );
  });

  bot.action(/edit_question_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    ctx.session.waitingFor = "edit_poll_question";
    ctx.session.editPollId = pollId;

    await ctx.answerCbQuery();
    await ctx.reply("✏️ Отправьте мне новый вопрос:");
  });

  bot.action(/add_option_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    ctx.session.waitingFor = "add_poll_option";
    ctx.session.editPollId = pollId;

    await ctx.answerCbQuery();
    await ctx.reply("➕ Отправьте мне текст нового варианта:");
  });

  bot.action(/edit_options_(.+)/, async (ctx) => {
    const pollId = ctx.match[1];
    ctx.session.editPollId = pollId;

    const poll = await Poll.findById(pollId);
    if (!poll) return ctx.reply("❌ Опрос не найден.");

    let optionsText = poll.options
      .map((opt, i) => `${i + 1}. ${opt.text}`)
      .join("\n");

    ctx.session.waitingFor = "choose_option_number";

    await ctx.answerCbQuery();
    await ctx.reply(
      `📝 Текущие варианты:\n${optionsText}\nОтправьте мне номер варианта, который вы хотите отредактировать:`
    );
  });

  // Handle choosing option number to edit
  bot.action("add_more_option", async (ctx) => {
    ctx.session.waitingFor = "create_poll_option";
    await ctx.answerCbQuery();
    await ctx.reply("➕ Отправьте мне текст следующего варианта:");
  });

  // Finish poll creation
  bot.action("finish_poll_creation", async (ctx) => {
    await ctx.answerCbQuery();

    const { question, options } = ctx.session.newPoll || {};

    if (!question || !options || options.length < 2) {
      return ctx.reply(
        "❌ Опрос должен содержать вопрос и как минимум 2 варианта ответа.."
      );
    }

    // Call your handleAdminPoll function, but pass options instead of default Yes/No
    await handleAdminPoll(ctx, question, options);

    ctx.session.waitingFor = null;
    ctx.session.newPoll = null;
  });

  // Admin conference management
  bot.action(/conferenceList_delete_(.+)/, async (ctx) => {
    const conferenceId = ctx.match[1];
    await Conference.findByIdAndDelete(conferenceId);
    await ctx.answerCbQuery("Конференция удалена ✅");
    await ctx.editMessageText("❌ Эта конференция была удалена.");
  });

  bot.action(/conferenceList_deactivate_(.+)/, async (ctx) => {
    const conferenceId = ctx.match[1];
    await Conference.findByIdAndUpdate(conferenceId, { isActive: false });
    await ctx.answerCbQuery("Конференция деактивирована ✅");
    await ctx.editMessageText("🚫 Эта конференция была деактивирована..");
  });

  bot.action(/conferenceList_activate_(.+)/, async (ctx) => {
    const conferenceId = ctx.match[1];
    await Conference.findByIdAndUpdate(conferenceId, { isActive: true });
    await ctx.answerCbQuery("Конференция активирована ✅");
    await ctx.editMessageText("✅ Эта конференция была активирована.");
  });

  bot.action(/conferenceList_edit_(.+)/, async (ctx) => {
    const conferenceId = ctx.match[1];
    ctx.session.waitingFor = "edit_conference_name";
    ctx.session.editConferenceId = conferenceId;
    await ctx.answerCbQuery();
    await ctx.reply("✏️ Пришлите мне новое название для этой конференции:");
  });

  // ============ PHOTO HANDLER ============
  bot.on("photo", async (ctx) => {
    if (!ctx.session || ctx.session.waitingFor !== "photo") return;

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      await UserProfile.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { photo: photo.file_id },
        { upsert: true }
      );

      await ctx.reply("✅ Фото обновлено!");
      ctx.session.waitingFor = null;
      await showMainMenu(ctx);
    } catch (error) {
      console.error("Photo error:", error);
      await ctx.reply("❌ Ошибка обновления фото");
    }
  });
};

// // ============ HELPER FUNCTIONS ============
// async function handleProfileInput(ctx, waitingFor, text) {
//   try {
//     let updateData = {};

//     if (waitingFor === "contacts") {

//       const contacts = {};
//   text.split("\n").forEach((line) => {
//     const idx = line.indexOf(":");
//     if (idx !== -1) {
//       const key = line.substring(0, idx).trim().toLowerCase();
//       const value = line.substring(idx + 1).trim();
//       if (key && value) contacts[key] = value;
//     }
//   });

//     } else {
//       updateData[waitingFor] = text
//         .split(",")
//         .map((s) => s.trim())
//         .filter((s) => s);
//     }

//     await UserProfile.findOneAndUpdate(
//       { telegramId: ctx.from.id },
//       updateData,
//       { upsert: true }
//     );

//     await ctx.reply("✅ Updated!");
//     ctx.session.waitingFor = null;
//     await showMainMenu(ctx);
//   } catch (error) {
//     console.error("Profile error:", error);
//     await ctx.reply("❌ Ошибка обновления профиля");
//   }
// }

// ============ HELPER FUNCTIONS ============
async function handleProfileInput(ctx, waitingFor, text) {
  try {
    let updateData = {};

    if (
      ["phone", "email", "telegram", "vkontakte"].includes(waitingFor)) {
      updateData[`contacts.${waitingFor}`] = text.trim();
    } else {
      updateData[waitingFor] = text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    }

    await UserProfile.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { $set: updateData }, // ✅ ensures it updates the right fields
      { upsert: true, new: true }
    );

    await ctx.reply("✅ Обновлено!");
    ctx.session.waitingFor = null;
    await showMainMenu(ctx);
  } catch (error) {
    console.error("Profile error:", error);
    await ctx.reply("❌ Ошибка обновления профиля");
  }
}

async function handleQuestionInput(ctx, text) {
  try {
    const userProfile = await UserProfile.findOne({ telegramId: ctx.from.id });
    const question = new Question({
      speaker: ctx.session.speakerName,
      question: text,
      askedBy: ctx.from.id,
      askedByName: `${userProfile.firstName} ${userProfile.lastName || ""}`,
      conference: userProfile.conference,
    });

    await question.save();
    await ctx.reply("✅ Вопрос отправлен!");

    const admins = await UserProfile.find({
      conference: userProfile.conference,
      isAdmin: true,
    });

    for (const admin of admins) {
      try {
        await ctx.telegram.sendMessage(
          admin.telegramId,
          `❓ *Получен новый вопрос*\n\n${text}`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💬 Отвечать",
                    callback_data: `admin_answer_${question._id}`,
                  },
                  {
                    text: "❌ Удалить",
                    callback_data: `admin_deleteQeustion_${question._id}`,
                  },
                ],
              ],
            },
          }
        );
      } catch (err) {
        console.error("Admin notify error:", err);
      }
    }

    ctx.session.waitingFor = null;
    ctx.session.speakerName = null;
  } catch (error) {
    console.error("Question error:", error);
    await ctx.reply("❌ Ошибка отправки вопроса");
  }
}

async function handleAdminPoll(ctx, question, options = null) {
  try {
    const user = await UserProfile.findOne({ telegramId: ctx.from.id });

    const poll = new Poll({
      question,
      conference: user.conference,
      createdBy: ctx.from.id,
      options: options || [{ text: "Yes" }, { text: "No" }], // fallback
    });

    await poll.save();
    ctx.session.waitingFor = null;

    // Notify all users in the conference
    const users = await UserProfile.find({ conference: user.conference });
    for (const u of users) {
      try {
        await ctx.telegram.sendMessage(
          u.telegramId,
          `📊 *Новый опрос:*\n${question}`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard(
              poll.options.map((opt, idx) => [
                Markup.button.callback(opt.text, `vote_${poll._id}_${idx}`),
              ])
            ),
          }
        );
      } catch (error) {
        console.error("Poll send error:", error);
      }
    }

    await ctx.reply("✅ Опрос создан и отправлен!");
  } catch (error) {
    console.error("Admin poll error:", error);
    await ctx.reply("❌ Ошибка создания опроса");
  }
}

async function handleAdminConference(ctx, name) {
  try {
    const code = generateConferenceCode();
    const conference = new Conference({
      name,
      code,
      createdBy: ctx.from.id,
      isPublic: true,
    });

    await conference.save();
    ctx.session.waitingFor = null;
    await ctx.reply(`✅ Конференция создана!\nКод: ${code}\nИмя: ${name}`);
  } catch (error) {
    console.error("Conference error:", error);
    await ctx.reply("❌ Ошибка создания конференции");
  }
}

async function handleConnection(ctx, targetUserId) {
  try {
    const existing = await Connection.findOne({
      $or: [
        { user1: ctx.from.id, user2: targetUserId },
        { user1: targetUserId, user2: ctx.from.id },
      ],
    });

    if (existing) {
      await ctx.reply("Уже подключено или ожидает подключения.");
      return;
    }

    const connection = new Connection({
      user1: ctx.from.id,
      user2: targetUserId,
      conference: (await UserProfile.findOne({ telegramId: ctx.from.id }))
        ?.conference,
    });

    await connection.save();

    const requester = await UserProfile.findOne({ telegramId: ctx.from.id });
    await ctx.telegram.sendMessage(
      targetUserId,
      `🤝 ${requester.firstName} хочет подключиться!`,
      Markup.inlineKeyboard([
        Markup.button.callback("✅ Принимать", `connect_${ctx.from.id}`),
        Markup.button.callback("❌ Отклонять", `reject_${ctx.from.id}`),
      ])
    );

    await ctx.reply("Запрос на подключение отправлен!");
  } catch (error) {
    console.error("Connection error:", error);
    await ctx.reply("❌ Ошибка отправки запроса");
  }
}

async function sendChatMessage(ctx, receiverId, text) {
  try {
    let connection = await Connection.findOne({
      $or: [
        { user1: ctx.from.id, user2: receiverId },
        { user1: receiverId, user2: ctx.from.id },
      ],
    });

    if (!connection) {
      connection = new Connection({
        user1: ctx.from.id,
        user2: receiverId,
        status: "accepted",
      });
    }

    const message = new Message({
      connectionId: connection._id,
      sender: ctx.from.id,
      receiver: receiverId,
      text: text,
    });

    await message.save();
    connection.lastMessage = {
      text,
      timestamp: new Date(),
      sender: ctx.from.id,
    };
    connection.unreadCount += 1;
    await connection.save();

    const sender = await UserProfile.findOne({ telegramId: ctx.from.id });
    await ctx.telegram.sendMessage(
      receiverId,
      `💬 От ${sender.firstName}:\n${text}`,
      Markup.inlineKeyboard([
        Markup.button.callback("Отвечать", `open_chat_${ctx.from.id}`),
      ])
    );

    await ctx.reply("✅ Сообщение отправлено!");
    ctx.session.waitingFor = null;
    ctx.session.chatWith = null;
  } catch (error) {
    console.error("Chat error:", error);
    await ctx.reply("❌ Ошибка отправки сообщения");
  }
}

async function handleVote(ctx, pollId, optionIndex) {
  try {
    const poll = await Poll.findById(pollId);
    if (!poll || !poll.isActive) {
      await ctx.reply("Опрос не активен.");
      return;
    }

    if (poll.options.some((opt) => opt.voters.includes(ctx.from.id))) {
      await ctx.reply("Уже проголосовали.");
      return;
    }

    poll.options[optionIndex].votes++;
    poll.options[optionIndex].voters.push(ctx.from.id);
    await poll.save();

    await ctx.reply("✅ Голосование зафиксировано!");
    await showPollResults(ctx, poll);
  } catch (error) {
    console.error("Vote error:", error);
    await ctx.reply("❌ Ошибка голосования");
  }
}

// ============ DISPLAY FUNCTIONS ============
async function showMainMenu(ctx) {
  const user = await UserProfile.findOne({ telegramId: ctx.from.id });
  const keyboard = user.isAdmin ? adminMainKeyboard() : mainKeyboard();

  await ctx.reply(`Выберите вариант:`, keyboard);
}

async function showProfile(ctx, profile) {
  let message = `👤 *Ваш профиль*\n\n`;
  message += `*Имя:* ${escapeMarkdown(profile.firstName)} ${escapeMarkdown(
    profile.lastName || ""
  )}\n`;
  message += `*Ник:* @${escapeMarkdown(profile.username || "N/A")}\n`;
  message += `*Конференция:* ${escapeMarkdown(
    profile.conference || "Not set"
  )}\n\n`;
  message += `*Тип:* ${profile.isAdmin ? "Администратор" : "Участник"}\n\n`;

  await ctx.reply(message, { parse_mode: "Markdown" });

  if (profile.photo) {
    try {
      if (profile.photo.startsWith("AgAC")) {
        await ctx.replyWithPhoto(profile.photo, { caption: "Ваше фото" });
      } else {
        await ctx.reply(`📸 Фото профиля: ${profile.photo}`);
      }
    } catch (error) {
      await ctx.reply("📸 Фото недоступно");
      console.error("Error sending photo:", error);
    }
  }

  console.log("Profile contacts:", profile.contacts);
  if (profile.contacts && Object.keys(profile.contacts).length > 0) {
    let contactsMsg = `*Контакты:*\n`;

    if (profile.contacts.phone) {
      contactsMsg += `• Телефон: ${escapeMarkdown(profile.contacts.phone)}\n`;
    }
    if (profile.contacts.email) {
      contactsMsg += `• Email: ${escapeMarkdown(profile.contacts.email)}\n`;
    }
    if (profile.contacts.telegram) {
      contactsMsg += `• Telegram: ${escapeMarkdown(
        profile.contacts.telegram
      )}\n`;
    }
    if (profile.contacts.vkontakte) {
      contactsMsg += `• Bкonтaктe: ${escapeMarkdown(
        profile.contacts.vkontakte
      )}\n`;
    }

    await ctx.reply(contactsMsg, { parse_mode: "Markdown" });
  }

  const sections = [
    { title: "Интересы", value: profile.interests },
    { title: "Я могу предложить", value: profile.offerings },
    { title: "Находясь в поиске", value: profile.lookingFor },
  ];

  for (const section of sections) {
    if (section.value && section.value.length > 0) {
      const safeValues = section.value.map((v) => escapeMarkdown(v));
      await ctx.reply(`*${section.title}:* ${safeValues.join(", ")}`, {
        parse_mode: "Markdown",
      });
    }
  }

  await ctx.reply("Что бы вы хотели отредактировать??", profileKeyboard());
}

async function showUserProfile(ctx, user) {
  let message = `👤 ${user.firstName} ${user.lastName || ""}\n`;
  message += `@${user.username || "N/A"}\n`;

  if (user.interests?.length)
    message += `Интересы: ${user.interests.join(", ")}\n`;
  if (user.offerings?.length)
    message += `Предложения: ${user.offerings.join(", ")}\n`;
  if (user.lookingFor?.length)
    message += `Находясь в поиске: ${user.lookingFor.join(", ")}\n`;

  try {
    if (user.photo?.startsWith("AgAC")) {
      await ctx.replyWithPhoto(user.photo, {
        caption: message,
        ...Markup.inlineKeyboard([
          Markup.button.callback("🤝 Соединять", `connect_${user.telegramId}`),
        ]),
      });
    } else {
      await ctx.reply(
        message,
        Markup.inlineKeyboard([
          Markup.button.callback("🤝 Соединять", `connect_${user.telegramId}`),
        ])
      );
    }
  } catch (error) {
    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback("🤝 Соединять", `connect_${user.telegramId}`),
      ])
    );
  }
}

async function showPoll(ctx, poll) {
  let message = `📊 ${poll.question}\n\n`;
  poll.options.forEach((opt, i) => {
    message += `${i + 1}. ${opt.text} (${opt.votes || 0} голоса)\n`;
  });
  await ctx.reply(message, pollKeyboard(poll._id, poll.options));
}

async function showPollResults(ctx, poll) {
  const total = poll.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
  let message = `📊 Результаты: ${poll.question}\n\n`;
  poll.options.forEach((opt, i) => {
    const percent =
      total > 0 ? (((opt.votes || 0) / total) * 100).toFixed(1) : 0;
    message += `${i + 1}. ${opt.text}: ${
      opt.votes || 0
    } голоса (${percent}%)\n`;
  });
  message += `\nВсего: ${total} голоса`;
  await ctx.reply(message);
}

// ============ UTILITY FUNCTIONS ============
function generateConferenceCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateAccessCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function escapeMarkdown(text) {
  return text?.toString().replace(/[_*[\]()~`]/g, "\\$&") || "";
}

module.exports = profileHandler;
