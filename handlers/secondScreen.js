const { Poll, Question, UserProfile, Connection, Conference } = require('../database');
const express = require('express');
const router = express.Router();

// Second screen routes for conference display
router.get('/conference/:conference/polls', async (req, res) => {
  try {
    const polls = await Poll.find({
      conference: req.params.conference,
      isActive: true
    });
    res.json(polls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conference/:conference/questions', async (req, res) => {
  try {
    const questions = await Question.find({
      conference: req.params.conference,
      isAnswered: false
    }).sort({ createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conference/:conference/stats', async (req, res) => {
  try {
    const userCount = await UserProfile.countDocuments({
      conference: req.params.conference,
      isActive: true
    });
    
    const connectionCount = await Connection.countDocuments({
      conference: req.params.conference,
      status: 'accepted'
    });
    
    res.json({
      participants: userCount,
      connections: connectionCount,
      activePolls: await Poll.countDocuments({
        conference: req.params.conference,
        isActive: true
      }),
      unansweredQuestions: await Question.countDocuments({
        conference: req.params.conference,
        isAnswered: false
      })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/conferences/public', async (req, res) => {
  try {
    const conferences = await Conference.find().sort({ createdAt: -1 });
    if (!conferences || conferences.length === 0) {
      return res.status(404).json({ message: 'No conferences available' });
    }

    res.json(conferences);
  }
  catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;