const express = require('express');
const multer = require("multer");
const driver = require('./neo4j-driver'); // your neo4j driver instance
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve profile pictures
app.use(express.json());

// Route: Get all movies
app.get('/movies', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (n:Movie) RETURN n');
    const movies = result.records.map(record => record.get('n').properties);
    res.json(movies);
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).send('Error fetching movies');
  } finally {
    await session.close();
  }
});

app.post('/signup', async (req, res) => {
  const { name, username, email, password } = req.body;

  // Server-side validation
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Please fill all required fields.' });
  }

  // Email format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Username validation
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.' });
  }

  // Password validation
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // Name validation
  const nameRegex = /^[a-zA-Z\s]{2,50}$/;
  if (!nameRegex.test(name)) {
    return res.status(400).json({ error: 'Name must contain only letters and spaces (2-50 characters).' });
  }

  const session = driver.session();

  try {
    // Check if user already exists (case-insensitive) - use original email for checking
    const checkUserQuery = `
      MATCH (u:User)
      WHERE toLower(u.username) = toLower($username) OR u.originalEmail = toLower($email)
      RETURN u.username as existingUsername, u.originalEmail as existingEmail
      LIMIT 1
    `;
    const result = await session.run(checkUserQuery, { username, email: email.toLowerCase() });

    if (result.records.length > 0) {
      const existing = result.records[0];
      const existingUsername = existing.get('existingUsername');
      const existingEmail = existing.get('existingEmail');
      
      if (existingUsername && existingUsername.toLowerCase() === username.toLowerCase()) {
        return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
      }
      if (existingEmail && existingEmail === email.toLowerCase()) {
        return res.status(400).json({ error: 'Email already registered. Please use a different email or try logging in.' });
      }
    }

    // Hash both password and email
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedEmail = await bcrypt.hash(email.toLowerCase(), 10);

    const createUserQuery = `
      CREATE (u:User {
        name: $name,
        username: $username,
        email: $hashedEmail,
        originalEmail: $originalEmail,
        password: $hashedPassword,
        profilePicture: $defaultPfp,
        createdAt: datetime()
      })
      RETURN u
    `;

    await session.run(createUserQuery, {
      name: name.trim(),
      username: username.toLowerCase(),
      hashedEmail: hashedEmail,
      originalEmail: email.toLowerCase(), // Store original for duplicate checking only
      hashedPassword: hashedPassword, // Fixed: was using $password instead of $hashedPassword
      defaultPfp: 'pp.jpg'
    });

    console.log(`New user ${username} created successfully with hashed email and password`);

    res.status(201).json({ 
      message: 'Account created successfully! You can now log in.',
      username: username.toLowerCase()
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  } finally {
    await session.close();
  }
});

// Route: Login with case-insensitive username
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const session = driver.session();

  try {
    // Search for user (case-insensitive)
    const result = await session.run(
      'MATCH (u:User) WHERE toLower(u.username) = toLower($username) RETURN u.name AS name, u.password AS password, u.profilePicture AS profilePicture, u.username AS actualUsername',
      { username }
    );

    if (result.records.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const storedPassword = result.records[0].get('password');
    const isMatch = await bcrypt.compare(password, storedPassword);

    if (isMatch) {
      const userName = result.records[0].get('name');
      const actualUsername = result.records[0].get('actualUsername');
      const profilePicture = result.records[0].get('profilePicture') || 'pp.jpg';
      
      console.log(`User ${actualUsername} logged in successfully`);
      
      res.json({ 
        message: 'Login successful', 
        name: userName,
        username: actualUsername, // Return the actual username from database
        profilePicture: profilePicture
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// Route: Upload profile picture
app.post("/upload-pfp", upload.single("pfp"), async (req, res) => {
  const username = req.body.username;

  console.log('Upload request received:', { username, hasFile: !!req.file });

  if (!req.file || !username) {
    return res.status(400).json({ success: false, message: 'Missing file or username.' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const session = driver.session();

  try {
    // Update the user's profile picture in the database
    const result = await session.run(
      `
      MATCH (u:User {username: $username})
      SET u.profilePicture = $filePath
      RETURN u.profilePicture AS profilePicture
      `,
      { username, filePath }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    console.log(`Profile picture updated for user ${username}: ${filePath}`);

    res.json({ success: true, newPfpPath: filePath });
  } catch (err) {
    console.error("Error saving profile picture:", err);
    res.status(500).json({ success: false, message: 'Error saving profile picture.' });
  } finally {
    await session.close();
  }
});

// Route: Get user profile picture
app.get('/user-profile/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u.profilePicture AS profilePicture',
      { username }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profilePicture = result.records[0].get('profilePicture') || 'pp.jpg';
    res.json({ profilePicture });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// Route: Delete account
app.post('/delete-account', async (req, res) => {
  const { username } = req.body;
  const session = driver.session();

  try {
    // Get user's profile picture path before deletion (to potentially clean up file)
    const userResult = await session.run(
      'MATCH (u:User {username: $username}) RETURN u.profilePicture AS profilePicture',
      { username }
    );

    if (userResult.records.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete the user and all their relationships
    await session.run(
      'MATCH (u:User {username: $username}) DETACH DELETE u',
      { username }
    );

    res.json({ message: 'Account deleted successfully.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    await session.close();
  }
});

// Get genres
app.get('/genres', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (m:Movie)
      RETURN DISTINCT m.genre AS genre
    `);

    const genres = result.records
      .map(record => record.get('genre'))
      .filter(Boolean);

    res.json(genres);
  } catch (error) {
    console.error("Error fetching genres:", error);
    res.status(500).send("Error fetching genres");
  } finally {
    await session.close();
  }
});

// FIXED Like a movie - Removes dislike if exists, then creates like
app.post('/like', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  console.log(`User ${username} is trying to like movie: ${movieName}`);

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
      
      // Check if movie is already liked
      OPTIONAL MATCH (u)-[existingLike:LIKES]->(m)
      
      // Check if movie is currently disliked
      OPTIONAL MATCH (u)-[existingDislike:DISLIKES]->(m)
      
      // If already liked, return without changes
      WITH u, m, existingLike, existingDislike
      WHERE existingLike IS NULL
      
      // Remove dislike if it exists
      FOREACH (dislike IN CASE WHEN existingDislike IS NOT NULL THEN [existingDislike] ELSE [] END |
        DELETE dislike
      )
      
      // Create the like relationship
      MERGE (u)-[:LIKES]->(m)
      
      RETURN 'success' as result
    `, { username, movieName });

    if (result.records.length === 0) {
      // Movie was already liked
      return res.json({ success: true, message: "Movie was already liked", alreadyLiked: true });
    }

    console.log(`Successfully liked movie ${movieName} for user ${username}`);
    res.json({ success: true, message: "Movie liked successfully" });

  } catch (error) {
    console.error("Error liking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

// FIXED Dislike a movie - Removes like if exists, then creates dislike
app.post('/dislike', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  console.log(`User ${username} is trying to dislike movie: ${movieName}`);

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
      
      // Check if movie is already disliked
      OPTIONAL MATCH (u)-[existingDislike:DISLIKES]->(m)
      
      // Check if movie is currently liked
      OPTIONAL MATCH (u)-[existingLike:LIKES]->(m)
      
      // If already disliked, return without changes
      WITH u, m, existingLike, existingDislike
      WHERE existingDislike IS NULL
      
      // Remove like if it exists
      FOREACH (like IN CASE WHEN existingLike IS NOT NULL THEN [existingLike] ELSE [] END |
        DELETE like
      )
      
      // Create the dislike relationship
      MERGE (u)-[:DISLIKES]->(m)
      
      RETURN 'success' as result
    `, { username, movieName });

    if (result.records.length === 0) {
      // Movie was already disliked
      return res.json({ success: true, message: "Movie was already disliked", alreadyDisliked: true });
    }

    console.log(`Successfully disliked movie ${movieName} for user ${username}`);
    res.json({ success: true, message: "Movie disliked successfully" });

  } catch (error) {
    console.error("Error disliking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

// Check movie status for a user (liked/disliked/neutral)
app.get('/movie-status/:username/:movieName', async (req, res) => {
  const { username, movieName } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
      
      OPTIONAL MATCH (u)-[like:LIKES]->(m)
      OPTIONAL MATCH (u)-[dislike:DISLIKES]->(m)
      
      RETURN 
        CASE WHEN like IS NOT NULL THEN 'liked' 
             WHEN dislike IS NOT NULL THEN 'disliked' 
             ELSE 'neutral' END as status
    `, { username, movieName });

    if (result.records.length > 0) {
      const status = result.records[0].get('status');
      res.json({ success: true, status });
    } else {
      res.json({ success: true, status: 'neutral' });
    }

  } catch (error) {
    console.error("Error checking movie status:", error);
    res.status(500).json({ success: false, message: "Error checking movie status" });
  } finally {
    await session.close();
  }
});

// Get smart recommendations based on user's likes and genre relationships
app.get('/recommendations/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    console.log(`Getting smart recommendations for user: ${username}`);

    // Multi-layered recommendation query
    const result = await session.run(`
      // Get user's liked movies and their genres
      MATCH (u:User {username: $username})-[:LIKES]->(liked:Movie)
      
      // Collect user's preferred genres with weights
      WITH u, 
           COLLECT(DISTINCT liked.genre) as preferred_genres,
           COLLECT(DISTINCT liked.director) as preferred_directors,
           COLLECT(DISTINCT liked.company) as preferred_companies,
           COLLECT(DISTINCT liked.star) as preferred_stars,
           COUNT(liked) as total_likes
      
      // Find movies that match user preferences
      MATCH (candidate:Movie)
      WHERE NOT EXISTS((u)-[:LIKES]->(candidate))
      AND NOT EXISTS((u)-[:DISLIKES]->(candidate))
      
      // Calculate recommendation score based on multiple factors
      WITH candidate, preferred_genres, preferred_directors, preferred_companies, preferred_stars, total_likes,
           // Genre score (highest weight)
           CASE WHEN candidate.genre IN preferred_genres THEN 10 ELSE 0 END as genre_score,
           // Director score
           CASE WHEN candidate.director IN preferred_directors THEN 5 ELSE 0 END as director_score,
           // Company score
           CASE WHEN candidate.company IN preferred_companies THEN 3 ELSE 0 END as company_score,
           // Star score
           CASE WHEN candidate.star IN preferred_stars THEN 4 ELSE 0 END as star_score,
           // Movie quality score (normalize to 0-3 range)
           CASE WHEN candidate.score IS NOT NULL THEN (candidate.score / 10.0) * 3 ELSE 0 END as quality_score,
           // Recency bonus (movies from last 10 years get small boost)
           CASE WHEN candidate.year >= (date().year - 10) THEN 1 ELSE 0 END as recency_bonus
      
      // Calculate total recommendation score
      WITH candidate, 
           (genre_score + director_score + company_score + star_score + quality_score + recency_bonus) as recommendation_score,
           genre_score, director_score, company_score, star_score, quality_score
      
      // Only return movies with some relevance (score > 0)
      WHERE recommendation_score > 0
      
      RETURN candidate, recommendation_score, genre_score, director_score, company_score, star_score, quality_score
      ORDER BY recommendation_score DESC, candidate.score DESC
      LIMIT 25
    `, { username });

    const recommendations = result.records.map(record => {
      const movie = record.get('candidate').properties;
      const score = record.get('recommendation_score');
      const breakdown = {
        genre: record.get('genre_score'),
        director: record.get('director_score'),
        company: record.get('company_score'),
        star: record.get('star_score'),
        quality: record.get('quality_score')
      };
      
      console.log(`Recommended: ${movie.name} (total score: ${score}, breakdown:`, breakdown, ')');
      return { movie, score, breakdown };
    });

    console.log(`Found ${recommendations.length} smart recommendations for ${username}`);

    if (recommendations.length === 0) {
      // Fallback: get popular movies not yet rated
      console.log('No personalized recommendations found, using popular movies fallback');
      
      const fallbackResult = await session.run(`
        MATCH (u:User {username: $username})
        MATCH (m:Movie)
        WHERE NOT EXISTS((u)-[:LIKES]->(m))
        AND NOT EXISTS((u)-[:DISLIKES]->(m))
        AND m.score IS NOT NULL
        RETURN m
        ORDER BY m.score DESC
        LIMIT 15
      `, { username });

      const fallbackMovies = fallbackResult.records.map(record => ({
        movie: record.get('m').properties,
        score: 0,
        breakdown: { fallback: true }
      }));
      
      res.json({ 
        success: true, 
        movies: fallbackMovies.map(r => r.movie),
        type: 'fallback',
        message: 'Showing popular movies as you haven\'t liked enough movies yet'
      });
    } else {
      res.json({ 
        success: true, 
        movies: recommendations.map(r => r.movie),
        type: 'personalized',
        message: `Showing ${recommendations.length} personalized recommendations`
      });
    }

  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ success: false, message: 'Recommendation failed' });
  } finally {
    await session.close();
  }
});

// Get filtered movies for homepage (mix of recommendations and popular)
app.get('/homepage-movies/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    console.log(`Getting homepage movies for user: ${username}`);

    // Get personalized recommendations
    const recommendationsResult = await session.run(`
      MATCH (u:User {username: $username})-[:LIKES]->(liked:Movie)
      
      WITH u, 
           COLLECT(DISTINCT liked.genre) as preferred_genres,
           COLLECT(DISTINCT liked.director) as preferred_directors,
           COLLECT(DISTINCT liked.company) as preferred_companies,
           COUNT(liked) as total_likes
      
      MATCH (candidate:Movie)
      WHERE NOT EXISTS((u)-[:LIKES]->(candidate))
      AND NOT EXISTS((u)-[:DISLIKES]->(candidate))
      
      WITH candidate, preferred_genres, preferred_directors, preferred_companies, total_likes,
           CASE WHEN candidate.genre IN preferred_genres THEN 10 ELSE 0 END as genre_score,
           CASE WHEN candidate.director IN preferred_directors THEN 5 ELSE 0 END as director_score,
           CASE WHEN candidate.company IN preferred_companies THEN 3 ELSE 0 END as company_score,
           CASE WHEN candidate.score IS NOT NULL THEN (candidate.score / 10.0) * 3 ELSE 0 END as quality_score
      
      WITH candidate, 
           (genre_score + director_score + company_score + quality_score) as recommendation_score
      
      RETURN candidate, recommendation_score
      ORDER BY recommendation_score DESC, candidate.score DESC
      LIMIT 15
    `, { username });

    // Get popular movies not yet rated
    const popularResult = await session.run(`
      MATCH (u:User {username: $username})
      MATCH (m:Movie)
      WHERE NOT EXISTS((u)-[:LIKES]->(m))
      AND NOT EXISTS((u)-[:DISLIKES]->(m))
      AND m.score IS NOT NULL
      RETURN m
      ORDER BY m.score DESC
      LIMIT 10
    `, { username });

    const recommendations = recommendationsResult.records.map(record => ({
      ...record.get('candidate').properties,
      _isRecommended: true,
      _score: record.get('recommendation_score')
    }));

    const popular = popularResult.records.map(record => ({
      ...record.get('m').properties,
      _isPopular: true
    }));

    // Merge and sort by recommendation score, then by movie score
    const allMovies = [...recommendations, ...popular]
      .reduce((unique, movie) => {
        // Remove duplicates based on movie name
        if (!unique.find(m => m.name === movie.name)) {
          unique.push(movie);
        }
        return unique;
      }, [])
      .sort((a, b) => {
        // Sort by recommendation score first, then by movie score
        const scoreA = a._score || 0;
        const scoreB = b._score || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (b.score || 0) - (a.score || 0);
      });

    console.log(`Homepage: ${recommendations.length} personalized + ${popular.length} popular = ${allMovies.length} total movies`);

    res.json({ 
      success: true, 
      movies: allMovies,
      stats: {
        personalized: recommendations.length,
        popular: popular.length,
        total: allMovies.length
      }
    });

  } catch (error) {
    console.error('Homepage movies error:', error);
    res.status(500).json({ success: false, message: 'Failed to get homepage movies' });
  } finally {
    await session.close();
  }
});

// Fix existing users without profile pictures
app.post('/fix-users', async (req, res) => {
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User)
      WHERE u.profilePicture IS NULL
      SET u.profilePicture = 'pp.jpg'
      RETURN COUNT(u) as updated_count
    `);

    const updatedCount = result.records[0].get('updated_count').low || result.records[0].get('updated_count');
    
    res.json({ 
      message: `Updated ${updatedCount} users with default profile picture`,
      updatedCount 
    });

  } catch (err) {
    console.error('Fix users error:', err);
    res.status(500).json({ error: 'Error updating users', details: err.message });
  } finally {
    await session.close();
  }
});

app.get('/search-users', async (req, res) => {
  const { query, currentUsername } = req.query;
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (u:User)
      WHERE (toLower(u.name) CONTAINS toLower($query)
         OR toLower(u.username) CONTAINS toLower($query))
        AND toLower(u.username) <> toLower($currentUsername)

      OPTIONAL MATCH (:User {username: $currentUsername})-[:FRIENDS_WITH]-(u)
      
      RETURN u.name AS name,
             u.username AS username,
             u.profilePicture AS profilePicture,
             COUNT((:User {username: $currentUsername})-[:FRIENDS_WITH]-(u)) > 0 AS isFriend
      `,
      { query, currentUsername }
    );

    const users = result.records.map(record => ({
      name: record.get('name'),
      username: record.get('username'),
      profilePicture: record.get('profilePicture') || 'pp.jpg',
      isFriend: record.get('isFriend')
    }));

    res.json({ success: true, users });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ success: false, error: 'Failed to search users' });
  } finally {
    await session.close();
  }
});


app.post('/add-friend', async (req, res) => {
  const { currentUsername, targetUsername } = req.body;

  if (!currentUsername || !targetUsername || currentUsername === targetUsername) {
    return res.status(400).json({ success: false, message: 'Invalid friend request.' });
  }

  const session = driver.session(); // Use the correct driver
  try {
    await session.run(
      `
      MATCH (a:User {username: $currentUsername}), (b:User {username: $targetUsername})
      MERGE (a)-[:FRIENDS_WITH]->(b)
      MERGE (b)-[:FRIENDS_WITH]->(a)
      `,
      { currentUsername, targetUsername }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Neo4j error:', error);
    res.status(500).json({ success: false, message: 'Database error.' });
  } finally {
    await session.close();
  }
});

app.get('/friends/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username})-[:FRIENDS_WITH]->(f:User)
      RETURN f.name AS name, f.username AS username, f.profilePicture AS profilePicture
    `, { username });

    const friends = result.records.map(record => ({
      name: record.get('name'),
      username: record.get('username'),
      profilePicture: record.get('profilePicture') || 'pp.jpg'
    }));

    res.json({ success: true, friends });
  } catch (err) {
    console.error('Error fetching friends:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch friends' });
  } finally {
    await session.close();
  }
});

app.post('/remove-friend', async (req, res) => {
  const { currentUsername, targetUsername } = req.body;
  const session = driver.session();

  if (!currentUsername || !targetUsername || currentUsername === targetUsername) {
    return res.status(400).json({ success: false, message: 'Invalid unfriend request.' });
  }

  try {
    await session.run(`
      MATCH (a:User {username: $currentUsername})-[r:FRIENDS_WITH]-(b:User {username: $targetUsername})
      DELETE r
    `, { currentUsername, targetUsername });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ success: false, message: 'Failed to remove friend.' });
  } finally {
    await session.close();
  }
});



// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
