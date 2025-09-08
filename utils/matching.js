const { UserProfile, Connection } = require('../database');

const findMatches = async (userId, conference) => {
  const user = await UserProfile.findOne({ telegramId: userId });
  if (!user) return [];

  // Find users with similar interests
  const potentialMatches = await UserProfile.find({
    telegramId: { $ne: userId },
    conference: conference,
    isActive: true,
    interests: { $in: user.interests || [] }
  });

  // Filter out existing connections
  const existingConnections = await Connection.find({
    $or: [{ user1: userId }, { user2: userId }]
  });


  const connectedUserIds = existingConnections.map(conn => 
    conn.user1 === userId ? conn.user2 : conn.user1
  );

  return potentialMatches.filter(match => 
    !connectedUserIds.includes(match.telegramId)
  );
};

const calculateMatchScore = (user1, user2) => {
  let score = 0;
  
  // Interest matching
  const commonInterests = user1.interests.filter(interest => 
    user2.interests.includes(interest)
  );
  score += commonInterests.length * 10;

  // Offering/Need matching
  if (user1.offerings && user2.lookingFor) {
    const offeringMatches = user1.offerings.filter(offering =>
      user2.lookingFor.includes(offering)
    );
    score += offeringMatches.length * 15;
  }

  if (user2.offerings && user1.lookingFor) {
    const needMatches = user2.offerings.filter(offering =>
      user1.lookingFor.includes(offering)
    );
    score += needMatches.length * 15;
  }

  return score;
};

module.exports = {
  findMatches,
  calculateMatchScore
};