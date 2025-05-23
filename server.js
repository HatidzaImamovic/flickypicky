const express = require('express');
const multer = require("multer");
const driver = require('./neo4j-driver'); // your neo4j driver instance
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = 3000;

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

// Route: Signup
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

    res.status(201).json({ message: 'User created successfully!' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    await session.close();
  }
});

// Route: Login
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
      const profilePicture = result.records[0].get('profilePicture') || 'pp.jpg';
      
      res.json({ 
        message: 'Login successful', 
        name: userName,
        profilePicture: profilePicture
      });
    } else {
      res.status(401).json({ message: 'Incorrect password' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// Route: Upload profile picture
app.post("/upload-pfp", upload.single("pfp"), async (req, res) => {
  const username = req.body.username;

  if (!req.file || !username) {
    return res.status(400).json({ success: false, message: 'Missing file or username.' });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const session = driver.session();

  try {
    // Update the user's profile picture in the database
    await session.run(
      `
      MATCH (u:User {username: $username})
      SET u.profilePicture = $filePath
      RETURN u.profilePicture AS profilePicture
      `,
      { username, filePath }
    );

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

app.post('/like', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  try {
    await session.run(
      `MATCH (u:User {username: $username}), (m:Movie {name: $movieName})
       MERGE (u)-[:LIKES]->(m)`,
      { username, movieName }
    );

    res.json({ success: true, message: "Liked successfully" });
  } catch (error) {
    console.error("Error liking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

app.post('/dislike', async (req, res) => {
  const { username, movieName } = req.body;
  const session = driver.session();

  try {
    await session.run(
      `MATCH (u:User {username: $username})-[r:LIKES]->(m:Movie {name: $movieName})
       DELETE r`,
      { username, movieName }
    );

    res.json({ success: true, message: "Disliked successfully" });
  } catch (error) {
    console.error("Error disliking movie:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    await session.close();
  }
});

app.get('/recommendations/:username', async (req, res) => {
  const { username } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (u:User {username: $username})-[:LIKES]->(liked:Movie)
      OPTIONAL MATCH (liked)-[:HAS_GENRE]->(g:Genre)<-[:HAS_GENRE]-(rec:Movie)
      OPTIONAL MATCH (liked)-[:PRODUCED_BY]->(c:Company)<-[:PRODUCED_BY]-(rec2:Movie)
      WITH COLLECT(DISTINCT rec) + COLLECT(DISTINCT rec2) AS recommendedMovies
      UNWIND recommendedMovies AS movie
      WITH DISTINCT movie
      WHERE NOT EXISTS {
        MATCH (:User {username: $username})-[:LIKES]->(movie)
      }
      RETURN movie {
        .name,
        .description,
        .rating
      }
      LIMIT 20
    `, { username });

    const movies = result.records.map(record => record.get('movie'));
    res.json({ success: true, movies });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ success: false, message: 'Recommendation failed' });
  } finally {
    await session.close();
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
