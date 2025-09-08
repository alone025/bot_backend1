const socketIo = require('socket.io');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Second screen connected');
    
    socket.on('join-conference', (conference) => {
      socket.join(conference);
    });
    
    socket.on('disconnect', () => {
      console.log('Second screen disconnected');
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const broadcastToConference = (conference, event, data) => {
  getIo().to(conference).emit(event, data);
};

module.exports = {
  initSocket,
  getIo,
  broadcastToConference
};