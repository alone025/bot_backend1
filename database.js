const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: String,
  lastName: String,
  username: String,
  photo: String,
  contacts: {
    phone: String,
    email: String,
    telegram: String,
    vkontakte: String,
  },
  interests: [String],
  offerings: [String],
  lookingFor: [String],
  conference: { type: String, default: "default" },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  isAdmin: { type: Boolean, default: false }, // New field to indicate admin status
});

const pollSchema = new mongoose.Schema({
  question: String,
  options: [
    {
      text: String,
      votes: { type: Number, default: 0 },
      voters: [Number], // telegramId of voters
    },
  ],
  conference: String,
  createdBy: Number, // telegramId of admin
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const questionSchema = new mongoose.Schema({
  speaker: String,
  question: String,
  answer: String,
  askedBy: Number, // telegramId
  askedByName: String,
  answeredBy: Number, // telegramId of admin who answered
  conference: String,
  isAnswered: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false }, // For second screen display
  createdAt: { type: Date, default: Date.now },
});

const connectionSchema = new mongoose.Schema({
  user1: Number, // telegramId
  user2: Number, // telegramId
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  conference: String,
  lastMessage: {
    text: String,
    timestamp: Date,
    sender: Number,
  },
  unreadCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Chat Message Schema
const messageSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Connection" },
  sender: Number, // telegramId
  receiver: Number, // telegramId
  text: String,
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

// Enhanced Conference Schema
const conferenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: String,
  isPublic: { type: Boolean, default: true },
  createdBy: { type: Number, required: true }, // telegramId of admin
  startDate: Date,
  endDate: Date,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Conference Access Code Schema
const accessCodeSchema = new mongoose.Schema({
  conference: String,
  code: { type: String, required: true, unique: true },
  createdBy: Number, // telegramId of admin
  expiresAt: Date,
  isUsed: { type: Boolean, default: false },
  usedBy: Number, // telegramId of user who used the code
  createdAt: { type: Date, default: Date.now },
});

// Models
const UserProfile = mongoose.model("UserProfile", userProfileSchema);
const Conference = mongoose.model("Conference", conferenceSchema);
const Poll = mongoose.model("Poll", pollSchema);
const Question = mongoose.model("Question", questionSchema);
const Connection = mongoose.model("Connection", connectionSchema);
const Message = mongoose.model("Message", messageSchema);
const AccessCode = mongoose.model("AccessCode", accessCodeSchema);

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  UserProfile,
  Conference,
  Poll,
  Question,
  Connection,
  Message,
  AccessCode,
};
