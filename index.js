const { Telegraf, session } = require('telegraf');
const express = require('express');
const http = require('http');
require('dotenv').config();

const { connectDB, Poll } = require('./database');
const profileHandler = require('./handlers/profile');
const secondScreenRoutes = require('./handlers/secondScreen');
const { initSocket, broadcastToConference } = require('./utils/socketManager');
const path = require('path');




const app = express();
const server = http.createServer(app);
const bot = new Telegraf(process.env.BOT_TOKEN);




// Initialize Socket.io
initSocket(server);


// Initialize Socket.io
// initSocket(server);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));


// Middleware
app.use(express.json());
app.use('/api/second-screen', secondScreenRoutes);

// Serve second screen HTML
app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'second-screen.html'));
});

// Serve socket.io client
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
});


// Initialize session
bot.use(session({
  defaultSession: () => ({
    waitingFor: null,
    speakerName: null
  })
}));

// Connect to database
connectDB();

// Load the combined handler
profileHandler(bot);


// adminHandler(bot);
// qrHandler(bot);

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ Произошла ошибка. Попробуйте ещё раз.');
});

// Broadcast poll updates to second screen
bot.action(/vote_/, async (ctx, next) => {
  await next();
  
  // After voting, broadcast update
  const pollId = ctx.match[1];
  const poll = await Poll.findById(pollId);
  if (poll) {
    broadcastToConference(poll.conference, 'pollUpdate', poll);
  }
});

// Broadcast new questions to second screen
bot.on('text', async (ctx, next) => {
  await next();
  
  if (ctx.session && ctx.session.waitingFor === 'question') {
    const userProfile = await UserProfile.findOne({ telegramId: ctx.from.id });
    broadcastToConference(userProfile.conference, 'newQuestion', {
      speaker: ctx.session.speakerName,
      question: ctx.message.text,
      askedBy: ctx.from.first_name
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📺 Second screen API: http://localhost:${PORT}/api/second-screen`);
});

// Start bot
bot.launch().then(() => {
  console.log('🤖 Conference Networking Bot is running!');
});

// Enable graceful stop
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close();
});

module.exports = bot;