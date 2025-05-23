let allMovies = [];
let currentMovieName = '';
let currentUsername = '';

// Show login or signup forms
function showSignUp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("signupPage").style.display = "flex";
}

function showLogIn() {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
}

// Sign up functionality
async function signup() {
  const name = document.getElementById('name').value.trim();
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!name || !username || !email || !password || !confirmPassword) {
    alert('Please fill all the fields.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match!');
    return;
  }

  try {
    const response = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      showLogIn();
    } else {
      alert(data.error || 'Signup failed.');
    }
  } catch (error) {
    alert('Error connecting to server.');
    console.error(error);
  }
}

// Login functionality - FIXED to properly load profile picture
async function login() {
  const user = document.getElementById("loginUsername").value;
  const pass = document.getElementById("password").value;

  if (!user || !pass) {
    alert('Please fill all the fields.');
    return;
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: user, password: pass })
    });

    const data = await response.json();

    if (response.ok) {
      const userName = data.name;
      const profilePicture = data.profilePicture || 'pp.jpg';

      // Set user info
      document.getElementById("greetingUsername").textContent = userName;
      currentUsername = user;

      // Load profile picture - FIXED
      console.log('Loading profile picture:', profilePicture); // Debug log
      const profilePicElement = document.getElementById("profilePic");
      if (profilePicture && profilePicture !== 'pp.jpg') {
        // If user has a custom profile picture, load it
        profilePicElement.src = profilePicture;
      } else {
        // Use default profile picture
        profilePicElement.src = 'pp.jpg';
      }

      // Show movie page
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("moviePage").style.display = "block";

      // Load user stats
      await loadUserStats();
      
      loadMovies();
      loadGenres();
    } else {
      alert(data.message);
    }

  } catch (error) {
    alert("Network error. Please try again.");
    console.error(error);
  }
}

// Load user statistics (followers, following counts)
async function loadUserStats() {
  if (!currentUsername) return;

  try {
    const response = await fetch(`/user-stats/${currentUsername}`);
    const data = await response.json();

    if (data.success) {
      document.getElementById("followersCount").textContent = data.stats.followers;
      document.getElementById("followingCount").textContent = data.stats.following;
    }
  } catch (error) {
    console.error('Error loading user stats:', error);
  }
}

function setupProfilePictureUpload() {
  const form = document.getElementById("pfpForm");
  if (!form) return; // Safety check

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const fileInput = document.getElementById("uploadPic");
    if (fileInput.files.length === 0) {
      alert("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("pfp", fileInput.files[0]);
    formData.append("username", currentUsername); // Include username

    try {
      const response = await fetch("/upload-pfp", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        alert("Profile picture updated!");
        
        // Update the profile picture immediately
        const profilePicElement = document.getElementById("profilePic");
        profilePicElement.src = result.newPfpPath;
        
        // Hide the popup after successful upload
        document.getElementById("userPopup").style.display = "none";
        
        // Clear the file input
        fileInput.value = '';
      } else {
        alert("Failed to update profile picture: " + (result.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Error uploading profile picture:", err);
      alert("Upload failed.");
    }
  });
}

// Logout
function logout() {
  currentUsername = '';
  document.getElementById("moviePage").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("userPopup").style.display = "none";
  
  // Reset profile picture to default
  document.getElementById("profilePic").src = "pp.jpg";
  
  // Clear login form
  document.getElementById("loginUsername").value = '';
  document.getElementById("password").value = '';
  
  // Reset user stats
  document.getElementById("followersCount").textContent = '0';
  document.getElementById("followingCount").textContent = '0';
}

// Delete account
async function deleteAccount() {
  const confirmDelete = confirm("Are you sure you want to delete your account? This action cannot be undone.");
  if (!confirmDelete) return;

  try {
    const response = await fetch('/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername })
    });

    const data = await response.json();
    if (response.ok) {
      alert(data.message);
      logout();
    } else {
      alert(data.error);
    }

  } catch (error) {
    console.error("Error deleting account:", error);
    alert("Error deleting account.");
  }
}

// Fetch TMDB poster
async function getTMDBPoster(title) {
  const apiKey = 'c9399d7437ee9e8e41b2c5e521904b14';
  const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&api_key=${apiKey}`;

  try {
    const response = await fetch(searchUrl);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const posterPath = data.results[0].poster_path;
      return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
    }
  } catch (error) {
    console.error('Error fetching poster from TMDb:', error);
  }
  return null;
}

// Load movies
async function loadMovies() {
  try {
    const response = await fetch('/movies');
    const data = await response.json();
    allMovies = data; // Cache all movies
    displayMovies(allMovies);
  } catch (error) {
    console.error('Error loading movies:', error);
  }
}

async function displayMovies(movies) {
  const container = document.getElementById('movies');
  container.innerHTML = '';

  if (!movies.length) {
    container.innerHTML = '<p>No movies found.</p>';
    return;
  }

  for (const movie of movies) {
    const div = document.createElement('div');
    div.className = 'movie-card';
    const posterUrl = await getTMDBPoster(movie.name);
    div.innerHTML = `
      <h3>${movie.name}</h3>
      ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster" class="movie-poster" style="width:150px; cursor:pointer;" onclick='showMovieDetails(${JSON.stringify(movie)})'>` : '<p>No poster available</p>'}
    `;
    container.appendChild(div);
  }
}

// Load genres
async function loadGenres() {
  try {
    const response = await fetch('/genres');
    const genres = await response.json();
    const dropdown = document.getElementById('genreDropdown');
    dropdown.innerHTML = '';
    const allOption = document.createElement('a');
    allOption.href = '#';
    allOption.textContent = 'All';
    allOption.onclick = () => filterMoviesByGenre('All');
    dropdown.appendChild(allOption);

    genres.forEach(genre => {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = genre;
      link.onclick = () => filterMoviesByGenre(genre);
      dropdown.appendChild(link);
    });
  } catch (error) {
    console.error("Failed to load genres:", error);
  }
}

// Filter movies
async function filterMoviesByGenre(selectedGenre) {
  try {
    const response = await fetch('/movies');
    const data = await response.json();
    const container = document.getElementById('movies');
    container.innerHTML = '';
    const filtered = selectedGenre === 'All' ? data : data.filter(movie => movie.genre === selectedGenre);
    if (!filtered.length) {
      container.innerHTML = `<p>No movies found in genre: ${selectedGenre}</p>`;
      return;
    }
    for (const movie of filtered) {
      const div = document.createElement('div');
      div.className = 'movie-card';
      const posterUrl = await getTMDBPoster(movie.name);
      div.innerHTML = `
        <h3>${movie.name}</h3>
        ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster" class="movie-poster" style="width:150px; cursor:pointer;" onclick='showMovieDetails(${JSON.stringify(movie)})'>` : '<p>No poster available</p>'}
      `;
      container.appendChild(div);
    }
  } catch (error) {
    console.error('Error filtering movies:', error);
  }
}

// Sort movies
async function sortMovies(criteria) {
  try {
    const response = await fetch('/movies');
    const data = await response.json();
    const container = document.getElementById('movies');
    container.innerHTML = '';

    if (criteria === 'newest') {
      data.sort((a, b) => (b.year.low || b.year) - (a.year.low || a.year));
    } else if (criteria === 'oldest') {
      data.sort((a, b) => (a.year.low || a.year) - (b.year.low || b.year));
    } else if (criteria === 'popular') {
      data.sort((a, b) => b.score - a.score);
    }

    for (const movie of data) {
      const div = document.createElement('div');
      div.className = 'movie-card';
      const posterUrl = await getTMDBPoster(movie.name);
      div.innerHTML = `
        <h3>${movie.name}</h3>
        ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster" class="movie-poster" style="width:150px; cursor:pointer;" onclick='showMovieDetails(${JSON.stringify(movie)})'>` : '<p>No poster available</p>'}
      `;
      container.appendChild(div);
    }
  } catch (error) {
    console.error('Error sorting movies:', error);
  }
}

// Show movie details
async function showMovieDetails(movie) {
  currentMovieName = movie.name;
  const modal = document.getElementById("movieModal");
  const modalDetails = document.getElementById("modalDetails");
  const posterUrl = await getTMDBPoster(movie.name);
  modalDetails.innerHTML = `
    <div class="modal-title">
      <h2>${movie.name}</h2>
    </div>
    <div class="modal-body">
      <div class="modal-poster">
        ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster">` : '<p>No poster available</p>'}
      </div>
      <div class="modal-info">
        <p><strong>Genre:</strong> ${movie.genre}</p>
        <p><strong>Year:</strong> ${typeof movie.year === 'object' ? movie.year.low : movie.year}</p>
        <p><strong>Score:</strong> ${movie.score}</p>
        <p><strong>Director:</strong> ${movie.director}</p>
        <p><strong>Writer:</strong> ${movie.writer}</p>
        <p><strong>Star:</strong> ${movie.star}</p>
        <p><strong>Country:</strong> ${movie.country}</p>
        <p><strong>Company:</strong> ${movie.company}</p>
        <p><strong>Runtime:</strong> ${typeof movie.runtime === 'object' ? movie.runtime.low : movie.runtime} minutes</p>
      </div>
    </div>
  `;
  modal.style.display = "block";
}

async function like() {
  if (!currentMovieName || !currentUsername) return;

  try {
    const res = await fetch('/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, movieName: currentMovieName })
    });

    const data = await res.json();
    if (data.success) {
      alert('Movie liked!');
      // Update user stats after liking
      await loadUserStats();
    } else {
      alert(data.message || 'Error liking movie.');
    }
  } catch (error) {
    console.error('Error liking movie:', error);
  }
}

async function dislike() {
  if (!currentMovieName || !currentUsername) return;

  try {
    const res = await fetch('/dislike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, movieName: currentMovieName })
    });

    const data = await res.json();
    if (data.success) {
      alert('Movie disliked!');
      // Update user stats after disliking
      await loadUserStats();
    } else {
      alert(data.message || 'Error disliking movie.');
    }
  } catch (error) {
    console.error('Error disliking movie:', error);
  }
}

async function likeMovie(movieName) {
  try {
    const response = await fetch('/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, movieName })
    });

    const result = await response.json();
    if (result.success) {
      alert('Movie liked!');
      // Now fetch updated recommendations
      loadRecommendations();
      // Update user stats
      await loadUserStats();
    } else {
      alert('Error liking movie.');
    }
  } catch (error) {
    console.error('Error liking movie:', error);
    alert('Failed to like movie.');
  }
}

async function loadRecommendations() {
  try {
    const response = await fetch(`/recommendations/${currentUsername}`);
    const data = await response.json();
    if (data.success) {
      displayMovies(data.movies);
    } else {
      console.error('Failed to fetch recommendations');
    }
  } catch (error) {
    console.error('Error loading recommendations:', error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const userBubble = document.getElementById("userBubble");
  const userPopup = document.getElementById("userPopup");

  userBubble.addEventListener("click", () => {
    userPopup.style.display = userPopup.style.display === "block" ? "none" : "block";
  });

  // Set default profile picture initially
  document.getElementById("profilePic").src = "pp.jpg";

  window.addEventListener("click", function(e) {
    if (!userBubble.contains(e.target) && !userPopup.contains(e.target)) {
      userPopup.style.display = "none";
    }
  });

  setupProfilePictureUpload();
});

// Close modal when the user clicks on <span> (x)
document.querySelector(".close").onclick = function () {
  document.getElementById("movieModal").style.display = "none";
};

// Also close modal if user clicks outside the modal content
window.onclick = function (event) {
  const modal = document.getElementById("movieModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

document.getElementById('searchBar').addEventListener('input', function () {
  const query = this.value.trim().toLowerCase();
  const filtered = allMovies.filter(movie => movie.name.toLowerCase().includes(query));
  displayMovies(filtered);
});
