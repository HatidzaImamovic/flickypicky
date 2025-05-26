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

// Enhanced signup functionality with validation
async function signup() {
  const name = document.getElementById('name').value.trim();
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  // Input validation
  if (!name || !username || !email || !password || !confirmPassword) {
    alert('Please fill all the fields.');
    return;
  }

  // Email format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address (e.g., user@example.com)');
    return;
  }

  // Username validation (no spaces, special characters)
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    alert('Username must be 3-20 characters long and contain only letters, numbers, and underscores');
    return;
  }

  // Password strength validation
  if (password.length < 6) {
    alert('Password must be at least 6 characters long');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match!');
    return;
  }

  // Name validation (only letters and spaces)
  const nameRegex = /^[a-zA-Z\s]{2,50}$/;
  if (!nameRegex.test(name)) {
    alert('Name must contain only letters and spaces (2-50 characters)');
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
      // Clear the form
      document.getElementById('name').value = '';
      document.getElementById('signupUsername').value = '';
      document.getElementById('email').value = '';
      document.getElementById('signupPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } else {
      alert(data.error || 'Signup failed.');
    }
  } catch (error) {
    alert('Error connecting to server.');
    console.error(error);
  }
}

// Enhanced login function to load smart homepage
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
      currentUsername = data.username || user; // Use returned username

      // Load profile picture
      console.log('Loading profile picture:', profilePicture);
      const profilePicElement = document.getElementById("profilePic");
      profilePicElement.src = profilePicture;

      // Show movie page
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("moviePage").style.display = "block";
      document.getElementById("friendsSection").style.display = "none";
      document.getElementById("moviesSection").style.display = "block";

      // Load user stats and smart homepage
      await loadSmartHomepage();
      await loadGenres();
      
      // Show welcome message
      showNotification(`Welcome back, ${userName}! 🎬`, 'success');
      
    } else {
      alert(data.message);
    }

  } catch (error) {
    alert("Network error. Please try again.");
    console.error(error);
  }
}

// Load smart homepage with personalized recommendations
async function loadSmartHomepage() {
  try {
    console.log('Loading smart homepage for user:', currentUsername);
    
    const response = await fetch(`/homepage-movies/${currentUsername}`);
    const data = await response.json();
    
    if (data.success) {
      console.log('Smart homepage loaded:', data.stats);
      displayMovies(data.movies);
      
      // Show a notification about personalized content
      if (data.stats.personalized > 0) {
        showNotification(`🎬 Found ${data.stats.personalized} personalized recommendations for you!`, 'success');
      }
    } else {
      console.log('Smart homepage failed, loading all movies');
      loadMovies();
    }
  } catch (error) {
    console.error('Error loading smart homepage:', error);
    loadMovies(); // Fallback to all movies
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
        showNotification("Profile picture updated! 📸", 'success');
        
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
  
  showNotification("Logged out successfully! 👋", 'info');
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
    
    // Check if this is a recommended movie
    const isRecommended = movie._isRecommended;
    const isPopular = movie._isPopular;
    
    if (isRecommended) {
      div.classList.add('recommended-movie');
    } else if (isPopular) {
      div.classList.add('popular-movie');
    }
    
    const posterUrl = await getTMDBPoster(movie.name);
    div.innerHTML = `
      ${isRecommended ? '<div class="recommendation-badge">Recommended for you</div>' : ''}
      ${isPopular ? '<div class="popular-badge">Popular</div>' : ''}
      <h3>${movie.name}</h3>
      ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster" class="movie-poster" style="width:150px; cursor:pointer;" onclick='showMovieDetails(${JSON.stringify(movie)})'>` : '<p>No poster available</p>'}
      <div class="movie-score">⭐ ${movie.score}/10</div>
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
        <div class="movie-score">⭐ ${movie.score}/10</div>
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
        <div class="movie-score">⭐ ${movie.score}/10</div>
      `;
      container.appendChild(div);
    }
  } catch (error) {
    console.error('Error sorting movies:', error);
  }
}

async function showMovieDetails(movie) {
  currentMovieName = movie.name;
  const modal = document.getElementById("movieModal");
  const modalDetails = document.getElementById("modalDetails");
  const posterUrl = await getTMDBPoster(movie.name);
  
  // Check if user has already liked/disliked this movie
  let movieStatus = 'neutral';
  try {
    const statusResponse = await fetch(`/movie-status/${currentUsername}/${encodeURIComponent(movie.name)}`);
    const statusData = await statusResponse.json();
    if (statusData.success) {
      movieStatus = statusData.status;
    }
  } catch (error) {
    console.error('Error checking movie status:', error);
  }
  
  modalDetails.innerHTML = `
    <div class="modal-title">
      <h2>${movie.name}</h2>
      ${movieStatus !== 'neutral' ? `<p class="movie-status ${movieStatus}">You ${movieStatus} this movie</p>` : ''}
    </div>
    <div class="modal-body">
      <div class="modal-poster">
        ${posterUrl ? `<img src="${posterUrl}" alt="${movie.name} poster">` : '<p>No poster available</p>'}
      </div>
      <div class="modal-info">
        <p><strong>Genre:</strong> ${movie.genre}</p>
        <p><strong>Year:</strong> ${typeof movie.year === 'object' ? movie.year.low : movie.year}</p>
        <p><strong>Score:</strong> ${movie.score}/10</p>
        <p><strong>Director:</strong> ${movie.director}</p>
        <p><strong>Writer:</strong> ${movie.writer}</p>
        <p><strong>Star:</strong> ${movie.star}</p>
        <p><strong>Country:</strong> ${movie.country}</p>
        <p><strong>Company:</strong> ${movie.company}</p>
        <p><strong>Runtime:</strong> ${typeof movie.runtime === 'object' ? movie.runtime.low : movie.runtime} minutes</p>
      </div>
    </div>
  `;
  
  // Update the existing buttons to work properly
  const modalImagesSection = document.querySelector('.modal-images');
  if (modalImagesSection) {
    modalImagesSection.innerHTML = `
      <button onclick="like()" class="thumb-btn ${movieStatus === 'liked' ? 'active-like' : ''}">
        <img src="like.png" alt="Like" />
      </button>
      <button onclick="dislike()" class="thumb-btn ${movieStatus === 'disliked' ? 'active-dislike' : ''}">
        <img src="dislike.png" alt="Dislike" />
      </button>
    `;
  }
  
  modal.style.display = "block";
}

// Enhanced like function with immediate homepage refresh
async function like() {
  if (!currentMovieName || !currentUsername) {
    alert('Please select a movie and make sure you are logged in.');
    return;
  }

  try {
    const res = await fetch('/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, movieName: currentMovieName })
    });

    const data = await res.json();
    if (data.success) {
      if (data.alreadyLiked) {
        showNotification('You already liked this movie! 👍', 'info');
      } else {
        showNotification('Movie liked! 👍', 'success');
        // Refresh the homepage with updated recommendations
        await loadSmartHomepage();
      }
      
      // Close the modal
      document.getElementById("movieModal").style.display = "none";
      
      // Update user stats
      await loadUserStats();
    } else {
      alert(data.message || 'Error liking movie.');
    }
  } catch (error) {
    console.error('Error liking movie:', error);
    alert('Failed to like movie.');
  }
}

// Enhanced dislike function with immediate homepage refresh
async function dislike() {
  if (!currentMovieName || !currentUsername) {
    alert('Please select a movie and make sure you are logged in.');
    return;
  }

  try {
    const res = await fetch('/dislike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, movieName: currentMovieName })
    });

    const data = await res.json();
    if (data.success) {
      if (data.alreadyDisliked) {
        showNotification('You already disliked this movie! 👎', 'info');
      } else {
        showNotification('Movie disliked! 👎', 'success');
        // Refresh the homepage with updated recommendations
        await loadSmartHomepage();
      }
      
      // Close the modal
      document.getElementById("movieModal").style.display = "none";
      
      // Update user stats
      await loadUserStats();
    } else {
      alert(data.message || 'Error disliking movie.');
    }
  } catch (error) {
    console.error('Error disliking movie:', error);
    alert('Failed to dislike movie.');
  }
}

// Load recommendations
async function loadRecommendations() {
  if (!currentUsername) return;
  
  try {
    const response = await fetch(`/recommendations/${currentUsername}`);
    const data = await response.json();
    if (data.success && data.movies && data.movies.length > 0) {
      console.log('Loaded recommendations:', data.movies.length);
      displayMovies(data.movies);
      showNotification(`🎬 Showing ${data.movies.length} personalized recommendations!`, 'success');
    } else {
      console.log('No recommendations found, showing all movies');
      loadMovies(); // Show all movies if no recommendations
      showNotification('No personalized recommendations yet. Like some movies to get started! 🎬', 'info');
    }
  } catch (error) {
    console.error('Error loading recommendations:', error);
    loadMovies(); // Fallback to showing all movies
  }
}

// Notification system
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style the notification
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-weight: 500;
    max-width: 300px;
    word-wrap: break-word;
    animation: slideInRight 0.3s ease-out;
  `;
  
  // Add animation keyframes if not already added
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Updated openUserModal function with liked movies
async function openUserModal(user) {
  const modal = document.getElementById('userModal');
  
  // Set user info
  document.getElementById('modalProfilePic').src = user.profilePicture || 'pp.jpg';
  document.getElementById('modalUsername').textContent = `@${user.username}`;
  document.getElementById('modalName').textContent = user.name;
  
  // Load and display liked movies
  await loadUserLikedMovies(user.username);
  
  modal.style.display = 'block';
}

// Function to load user's liked movies
async function loadUserLikedMovies(username) {
  const likedMoviesList = document.getElementById('likedMoviesList');
  likedMoviesList.innerHTML = '<div style="text-align: center; color: #888;">Loading liked movies...</div>';
  
  try {
    const response = await fetch(`/user-liked-movies/${username}`);
    const data = await response.json();
    
    if (data.success && data.movies && data.movies.length > 0) {
      likedMoviesList.innerHTML = '';
      
      for (const movie of data.movies) {
        const movieDiv = document.createElement('div');
        movieDiv.className = 'liked-movie-item';
        
        // Get poster from TMDB (reuse existing function)
        const posterUrl = await getTMDBPoster(movie.name);
        
        movieDiv.innerHTML = `
          ${posterUrl ? 
            `<img src="${posterUrl}" alt="${movie.name}" class="liked-movie-poster">` : 
            `<div class="liked-movie-poster" style="background-color: #333; display: flex; align-items: center; justify-content: center; color: #666; font-size: 10px;">No Poster</div>`
          }
          <p class="liked-movie-title">${movie.name}</p>
          <div class="liked-movie-score">⭐ ${movie.score}/10</div>
        `;
        
        likedMoviesList.appendChild(movieDiv);
      }
    } else {
      likedMoviesList.innerHTML = '<div class="no-movies-message">This user hasn\'t liked any movies yet.</div>';
    }
  } catch (error) {
    console.error('Error loading user liked movies:', error);
    likedMoviesList.innerHTML = '<div class="no-movies-message">Error loading liked movies.</div>';
  }
}

// Updated event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Close modal event listener
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document.getElementById('userModal').style.display = 'none';
    });
  }

  // Click outside modal to close
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('userModal');
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
});

// Updated showFriends function (same as before but included for completeness)
async function showFriends() {
  document.getElementById('moviesSection').style.display = 'none';
  document.getElementById('friendsSection').style.display = 'block';
  document.getElementById('searchBar').style.display = 'none';

  const friendsList = document.getElementById('friendsList');
  friendsList.innerHTML = '';

  try {
    const response = await fetch(`/friends/${currentUsername}`);
    const data = await response.json();

    if (data.success && data.friends.length > 0) {
      data.friends.forEach(friend => {
        const profilePicture = friend.profilePicture || 'pp.jpg';

        const card = document.createElement('div');
        card.className = 'friend-card';

        card.innerHTML = `
          <img src="${profilePicture}" alt="${friend.username}" class="clickable-pfp">
          <h3>@${friend.username}</h3>
          <p>${friend.name}</p>
          <button onclick="unfriend('${friend.username}')">Unfriend</button>
        `;

        friendsList.appendChild(card);

        // Add click event to the profile picture after adding to DOM
        const profilePicElement = card.querySelector('.clickable-pfp');
        profilePicElement.addEventListener('click', () => {
          openUserModal(friend);
        });
      });
    } else {
      friendsList.innerHTML = '<p>You have no friends yet.</p>';
    }
  } catch (err) {
    console.error('Error fetching friends:', err);
    friendsList.innerHTML = '<p>Error loading friends.</p>';
  }
}




async function unfriend(targetUsername) {
  const confirmUnfriend = confirm(`Are you sure you want to unfriend @${targetUsername}?`);
  if (!confirmUnfriend) return;

  try {
    const response = await fetch('/remove-friend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUsername, targetUsername })
    });

    const data = await response.json();
    if (data.success) {
      showNotification(`You unfriended @${targetUsername}`, 'info');
      showFriends(); // Refresh the friends list
    } else {
      alert(data.message || 'Failed to unfriend.');
    }
  } catch (err) {
    console.error('Error unfriending:', err);
    alert('An error occurred while unfriending.');
  }
}


function resetToHome() {
  // Show movies section
  document.getElementById('moviesSection').style.display = 'block';

  // Hide friends section
  document.getElementById('friendsSection').style.display = 'none';

  document.getElementById('searchBar').style.display = 'block';

  document.getElementById('menu').style.display = 'block';


  loadSmartHomepage();
}

function showAllMovies(){
  document.getElementById('moviesSection').style.display = 'block';

    // Hide friends section
  document.getElementById('friendsSection').style.display = 'none';

  document.getElementById('searchBar').style.display = 'block';

  loadMovies();
}

async function sendFriendRequest(targetUsername) {
  try {
    const response = await fetch('/add-friend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
      currentUsername, 
      targetUsername 
      })
    });

    const data = await response.json();
    if (data.success) {
      showNotification(`You friended @${targetUsername}`, 'info');
      showFriends();
    } else {
      alert(data.message || 'Failed to add friend.');
    }
  } catch (err) {
    console.error('Error sending friend request:', err);
    alert('An error occurred while sending friend request.');
  }
}


document.getElementById('userSearchInput').addEventListener('input', async function () {
  const query = this.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('userResults');
  resultsContainer.innerHTML = '';

  if (!query) return;

  try {
    const response = await fetch(`/search-users?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (data.success && data.users.length > 0) {
      data.users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';

        card.innerHTML = `
          <img src="${user.profilePicture}" alt="${user.username}">
          <h3>@${user.username}</h3>
          <p>${user.name}</p>
          <button onclick="sendFriendRequest('${user.username}')">Friend</button>
        `;
        resultsContainer.appendChild(card);
      });
    } else {
      resultsContainer.innerHTML = `<p>No users found for "${query}".</p>`;
    }
  } catch (err) {
    console.error('Search failed:', err);
    resultsContainer.innerHTML = '<p>Error searching users.</p>';
  }
});

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

  document.getElementById('uploadPic').addEventListener('change', function() {
  const fileStatus = document.getElementById('fileStatus');
  const uploadBtn = document.getElementById('uploadBtn');
  
  if (this.files.length > 0) {
    fileStatus.textContent = this.files[0].name;
    uploadBtn.disabled = false;
  } else {
    fileStatus.textContent = 'No file chosen';
    uploadBtn.disabled = true;
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

// Enhanced search functionality
document.getElementById('searchBar').addEventListener('input', async function () {
  const query = this.value.trim().toLowerCase();
  
  if (query === '') {
    await loadMovies();
    loadSmartHomepage();
  } else {
    // Filter movies based on search query
    const filtered = allMovies.filter(movie => 
      movie.name.toLowerCase().includes(query) ||
      movie.genre.toLowerCase().includes(query) ||
      movie.director.toLowerCase().includes(query) ||
      movie.star.toLowerCase().includes(query)
    );
    displayMovies(filtered);
    
    if (filtered.length === 0) {
      document.getElementById('movies').innerHTML = `<p>No movies found for "${query}"</p>`;
    }
  }
});
