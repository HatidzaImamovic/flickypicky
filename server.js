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

// Route: Signup (SINGLE VERSION - FIXED)
app.post('/signup', async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Please fill all required fields.' });
  }

  const session = driver.session();

  try {
    const checkUserQuery = `
      MATCH (u:User)
      WHERE u.username = $username OR u.email = $email
      RETURN u LIMIT 1
    `;
    const result = await session.run(checkUserQuery, { username, email });

    if (result.records.length > 0) {
      return res.status(400).json({ error: 'User with that username or email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createUserQuery = `
      CREATE (u:User {
        name: $name,
        username: $username,
        email: $email,
        password: $password,
        profilePicture: $defaultPfp
      })
      RETURN u
    `;

    await session.run(createUserQuery, {
      name,
      username,
      email,
      password: hashedPassword,
      defaultPfp: 'pp.jpg' // Set default profile picture for new users
    });

    console.log(`New user ${username} created with default profile picture`);

    res.status(201).json({ message: 'User created successfully!' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    await session.close();
  }
});

// Route: Login (FIXED)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const session = driver.session();

  try {
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u.name AS name, u.password AS password, u.profilePicture AS profilePicture',
      { username }
    );

    if (result.records.length === 0) {
      return res.status(401).json({ message: 'User does not exist' });
    }

    const storedPassword = result.records[0].get('password');
    const isMatch = await bcrypt.compare(password, storedPassword);

    if (isMatch) {
      const userName = result.records[0].get('name');
      // Get profile picture path, default to 'pp.jpg' if none exists
      const profilePicture = result.records[0].get('profilePicture') || 'pp.jpg';
      
      console.log(`User ${username} logged in with profile picture: ${profilePicture}`);
      
      res.json({ 
        message: 'Login successful', 
        name: userName,
        profilePicture: profilePicture
      });
    } else {
      res.status(401).json({ message: 'Incorrect password' });
    }

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// Route: Upload profile picture (FIXED)
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

// Serve moviePage.html
app.get('/moviePage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'moviePage.html'));
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
// FIXED SERVER ROUTES - Replace your existing like, dislike, and recommendations routes with these:

// FIXED Like a movie - Creates LIKES relationship
app.post('/like', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  console.log(`User ${username} is trying to like movie: ${movieName}`); // Debug log

  try {
    // Remove any existing dislike and add like
    await session.run(`
      MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
      
      // Remove existing DISLIKE relationship if it exists
      OPTIONAL MATCH (u)-[dislike:DISLIKES]->(m)
      DELETE dislike
      
      // Create LIKES relationship
      MERGE (u)-[:LIKES]->(m)
    `, { username, movieName });

    console.log(`Successfully liked movie ${movieName} for user ${username}`); // Debug log

    res.json({ success: true, message: "Movie liked successfully" });
  } catch (error) {
    console.error("Error liking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

// FIXED Dislike a movie - Creates DISLIKES relationship
app.post('/dislike', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  console.log(`User ${username} is trying to dislike movie: ${movieName}`); // Debug log

  try {
    // Remove any existing like and add dislike
    await session.run(`
      MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
      
      // Remove existing LIKE relationship if it exists
      OPTIONAL MATCH (u)-[like:LIKES]->(m)
      DELETE like
      
      // Create DISLIKES relationship
      MERGE (u)-[:DISLIKES]->(m)
    `, { username, movieName });

    console.log(`Successfully disliked movie ${movieName} for user ${username}`); // Debug log

    res.json({ success: true, message: "Movie disliked successfully" });
  } catch (error) {
    console.error("Error disliking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

// FIXED Enhanced recommendations based on movie properties
app.get('/recommendations/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    console.log(`Getting recommendations for user: ${username}`); // Debug log

    // Get content-based recommendations
    const result = await session.run(`
      // Find movies liked by the user
      MATCH (u:User {username: $username})-[:LIKES]->(liked:Movie)
      
      // Find similar movies based on genre, director, company, star
      MATCH (similar:Movie)
      WHERE similar <> liked
      AND (
        similar.genre = liked.genre OR
        similar.director = liked.director OR
        similar.company = liked.company OR
        similar.star = liked.star
      )
      // Exclude movies already liked or disliked
      AND NOT EXISTS((u)-[:LIKES]->(similar))
      AND NOT EXISTS((u)-[:DISLIKES]->(similar))
      
      // Score based on number of matching criteria
      WITH similar, 
           COUNT(DISTINCT CASE WHEN similar.genre = liked.genre THEN 1 END) as genre_matches,
           COUNT(DISTINCT CASE WHEN similar.director = liked.director THEN 1 END) as director_matches,
           COUNT(DISTINCT CASE WHEN similar.company = liked.company THEN 1 END) as company_matches,
           COUNT(DISTINCT CASE WHEN similar.star = liked.star THEN 1 END) as star_matches,
           COUNT(DISTINCT liked) as total_liked_movies
      
      WITH similar, 
           (genre_matches + director_matches + company_matches + star_matches) as similarity_score,
           similar.score as movie_score
      
      WHERE similarity_score > 0
      
      RETURN similar, similarity_score, movie_score
      ORDER BY similarity_score DESC, movie_score DESC
      LIMIT 20
    `, { username });

    const movies = result.records.map(record => {
      const movie = record.get('similar').properties;
      const score = record.get('similarity_score').low || record.get('similarity_score');
      console.log(`Recommended: ${movie.name} (score: ${score})`); // Debug log
      return movie;
    });

    console.log(`Found ${movies.length} recommendations for ${username}`); // Debug log

    if (movies.length === 0) {
      // If no recommendations found, try a simpler approach - popular movies not yet rated
      const fallbackResult = await session.run(`
        MATCH (u:User {username: $username})
        MATCH (m:Movie)
        WHERE NOT EXISTS((u)-[:LIKES]->(m))
        AND NOT EXISTS((u)-[:DISLIKES]->(m))
        AND m.score IS NOT NULL
        RETURN m
        ORDER BY m.score DESC
        LIMIT 10
      `, { username });

      const fallbackMovies = fallbackResult.records.map(record => record.get('m').properties);
      console.log(`Using fallback recommendations: ${fallbackMovies.length} movies`); // Debug log
      
      res.json({ success: true, movies: fallbackMovies });
    } else {
      res.json({ success: true, movies });
    }

  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ success: false, message: 'Recommendation failed' });
  } finally {
    await session.close();
  }
});

// Add route to get user's liked movies (for debugging)
app.get('/user-likes/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username})-[:LIKES]->(movie:Movie)
      RETURN movie
      ORDER BY movie.name
    `, { username });

    const likedMovies = result.records.map(record => record.get('movie').properties);
    res.json({ success: true, movies: likedMovies, count: likedMovies.length });
  } catch (error) {
    console.error('Error getting liked movies:', error);
    res.status(500).json({ success: false, message: 'Failed to get liked movies' });
  } finally {
    await session.close();
  }
});

// Add route to get user's disliked movies (for debugging)
app.get('/user-dislikes/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username})-[:DISLIKES]->(movie:Movie)
      RETURN movie
      ORDER BY movie.name
    `, { username });

    const dislikedMovies = result.records.map(record => record.get('movie').properties);
    res.json({ success: true, movies: dislikedMovies, count: dislikedMovies.length });
  } catch (error) {
    console.error('Error getting disliked movies:', error);
    res.status(500).json({ success: false, message: 'Failed to get disliked movies' });
  } finally {
    await session.close();
  }
});

// Get user statistics
app.get('/user-stats/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username})
      
      OPTIONAL MATCH (u)-[:FOLLOWS]->(following:User)
      WITH u, COUNT(following) as following_count
      
      OPTIONAL MATCH (follower:User)-[:FOLLOWS]->(u)
      WITH u, following_count, COUNT(follower) as followers_count
      
      OPTIONAL MATCH (u)-[:LIKES]->(liked:Movie)
      WITH u, following_count, followers_count, COUNT(liked) as liked_movies_count
      
      RETURN following_count, followers_count, liked_movies_count
    `, { username });

    if (result.records.length > 0) {
      const record = result.records[0];
      const stats = {
        followers: record.get('followers_count').low || record.get('followers_count') || 0,
        following: record.get('following_count').low || record.get('following_count') || 0,
        likedMovies: record.get('liked_movies_count').low || record.get('liked_movies_count') || 0
      };
      res.json({ success: true, stats });
    } else {
      res.json({ success: true, stats: { followers: 0, following: 0, likedMovies: 0 } });
    }
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ success: false, message: 'Failed to get user stats' });
  } finally {
    await session.close();
  }
});

// DEBUG ROUTES - Add these temporarily to test
app.get('/debug/user/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u',
      { username }
    );

    if (result.records.length === 0) {
      return res.json({ error: 'User not found', username });
    }

    const user = result.records[0].get('u').properties;
    res.json({ 
      username,
      user,
      message: 'User data retrieved successfully'
    });

  } catch (err) {
    console.error('Debug user error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } finally {
    await session.close();
  }
});

app.get('/debug/uploads', (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ 
        error: 'uploads directory does not exist',
        path: uploadsDir
      });
    }

    const files = fs.readdirSync(uploadsDir);
    res.json({ 
      uploadsDirectory: uploadsDir,
      files: files,
      count: files.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Cannot read uploads directory', details: err.message });
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

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
