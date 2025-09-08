const { Markup } = require('telegraf');
const { Conference } = require('../database');

const mainKeyboard = () => {
  return Markup.keyboard([
   ['👤 Мой профиль', '🔍 Найти людей'],

['📊 Активные опросы', '❓ Спросите спикера'],

['🤝 Мои связи', '⭐ Избранные профили'],

['💬 Мои чаты', '']
  ]).resize();
};

const profileKeyboard = () => {
  return Markup.keyboard([
 ['📸 Изменить фото', '📞 Изменить контакты'],

['🎯 Изменить интересы', '💼 Изменить предложения'],

['🔍 Изменить поиск', '⬅️ Вернуться на главную']
  ]).resize();
};

const backKeyboard = () => {
  return Markup.keyboard([['⬅️ Вернуться на главную']]).resize();
};

const pollKeyboard = (pollId, options) => {
  const buttons = options.map((option, index) => 
    Markup.button.callback(option.text, `vote_${pollId}_${index}`)
  );
  return Markup.inlineKeyboard(buttons);
};

const connectionKeyboard = (connectionId) => {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Принять', `accept_${connectionId}`),
    Markup.button.callback('❌ Отклонить', `reject_${connectionId}`)
  ]);
};

// const conferenceKeyboard = () => {
//   return Markup.inlineKeyboard([
//     [
//       Markup.button.callback('Tech Conference 2024', 'conference_tech2024'),
//       Markup.button.callback('Business Summit 2024', 'conference_business2024')
//     ]
//   ]);
// };
const conferenceKeyboard = async () => {
  const conferences = await Conference.find({ isPublic: true });

  if (!conferences.length) {
    return Markup.inlineKeyboard([
      [Markup.button.callback("❌ Публичные конференции недоступны", "noop")]
    ]);
  }

  const buttons = conferences.map(conf =>
    Markup.button.callback(conf.name, `conference_${conf._id}_${conf.name}`)
  );

  // arrange buttons in rows of 2
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return Markup.inlineKeyboard(rows);
};


const connectKeyboard = (userId) => {
  return Markup.inlineKeyboard([
    Markup.button.callback('🤝 Подключайтесь', `connect_${userId}`)
  ]);
};

const adminMainKeyboard = () => {
  return Markup.keyboard([
   ['👤 Мой профиль', '🔍 Найти людей'],

['📊 Активные опросы', '❓ Спросите спикера'],

['🤝 Мои связи', '⭐ Избранные профили'],

['💬 Мои чаты', '🛠️ Панель администратора']
  ]).resize();
};

const adminKeyboard = () => {
  return Markup.keyboard([
 ['📊 Создать опрос', '📋 Управление вопросами'],

['🏢 Создать конференцию', '🔑 Сгенерировать QR-код'],

['📋 Список опросов', '📋 Список конференций'],

['⬅️ Вернуться на главную']
  ]).resize();
};



module.exports = {
  mainKeyboard,
  profileKeyboard,
  backKeyboard,
  pollKeyboard,
  connectionKeyboard,
  conferenceKeyboard,
  connectKeyboard  ,
  adminMainKeyboard,
  adminKeyboard
};