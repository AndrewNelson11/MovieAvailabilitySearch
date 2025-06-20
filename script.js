document.addEventListener('DOMContentLoaded', function() {
const form = document.getElementById('searchForm');
const input = document.getElementById('searchInput');
const titleTypeSelect = document.getElementById('titleTypeSelect');
const resultsDiv = document.getElementById('results');
const genreFilterForm = document.getElementById('genreFilterForm');
const genreFilterSelect = document.getElementById('genreFilterSelect');
const genreFilterResults = document.getElementById('genreFilterResults');
const typeFilterSelect = document.getElementById('typeFilterSelect');
const loadMoreBtn = document.getElementById('loadMoreBtn');

const API_KEY = 'fb18c89734msh7fc387de1782bb7p1b694fjsn83d9a371f0fb';
const API_HOST = 'streaming-availability.p.rapidapi.com';

let lastGenre = '';
let lastType = '';
let currentPage = 1;
let lastResults = [];
let allGenreResults = [];
let currentGenrePage = 1;
let apiPage = 1;
let apiResults = [];
let displayIndex = 0;
let shownMovieKeys = new Set();

// Fetch genres from the API and populate the dropdown for the genre filter box
fetch('https://streaming-availability.p.rapidapi.com/genres?output_language=en', {
  method: 'GET',
  headers: {
    'x-rapidapi-key': API_KEY,
    'x-rapidapi-host': API_HOST
  }
})
  .then(res => res.json())
  .then(genres => {
    genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre.id || genre.name || genre;
      option.textContent = genre.name || genre.id || genre;
      genreFilterSelect.appendChild(option);
    });
  })
  .catch(err => {
    genreFilterSelect.innerHTML = '<option value="">Error loading genres</option>';
  });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  const type = titleTypeSelect.value;
  if (!query) return;
  resultsDiv.innerHTML = '<p>Searching...</p>';
  try {
    let showTypeParam = '';
    if (type === 'movie') showTypeParam = '&show_type=movie';
    else if (type === 'series') showTypeParam = '&show_type=series';
    // If 'both', omit show_type to get all
    let url = `https://${API_HOST}/shows/search/title?title=${encodeURIComponent(query)}&country=us&series_granularity=show${showTypeParam}&output_language=en`;
    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    };
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    displayResults(data);
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
  }
});

genreFilterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const genre = genreFilterSelect.value;
  const type = typeFilterSelect.value;
  if (!genre) return;
  genreFilterResults.innerHTML = '<p>Searching...</p>';
  lastGenre = genre;
  lastType = type;
  currentPage = 1;
  await fetchGenreResults(genre, type, 1, true);
});

loadMoreBtn.addEventListener('click', async () => {
  currentPage++;
  await fetchGenreResults(lastGenre, lastType, currentPage, false);
});

function getUniqueResults(results) {
  const seen = new Set();
  return results.filter(item => {
    const key = item.imdbID || item.tmdbID || item.id || item.title + (item.releaseYear || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchGenreResults(genre, type, page, clear) {
  try {
    if (clear) {
      apiPage = 1;
      apiResults = [];
      displayIndex = 0;
      shownMovieKeys = new Set();
      genreFilterResults.innerHTML = '';
    }
    let foundNew = false;
    let tries = 0;
    let newMovies = [];
    // Try up to 5 pages in a row to find new unique movies
    while (!foundNew && tries < 5) {
      // Only fetch from API if we need more results
      if (apiResults.length === 0 || displayIndex >= apiResults.length) {
        const url = `https://${API_HOST}/shows/search/filters?country=us&show_type=${type}&genres=${encodeURIComponent(genre)}&output_language=en&page=${apiPage}`;
        const options = {
          method: 'GET',
          headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': API_HOST
          }
        };
        const response = await fetch(url, options);
        if (!response.ok) throw new Error('API error');
        const data = await response.json();
        let results = Array.isArray(data.shows) ? data.shows : [];
        results = getUniqueResults(results);
        results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        apiResults = results;
        displayIndex = 0;
        apiPage++;
      }
      // Filter out already shown movies
      newMovies = apiResults.slice(displayIndex).filter(item => {
        const key = item.imdbID || item.tmdbID || item.id || item.title + (item.releaseYear || '');
        return !shownMovieKeys.has(key);
      });
      if (newMovies.length > 0) {
        foundNew = true;
      } else {
        // No new movies in this page, try next API page
        apiResults = [];
        displayIndex = 0;
        tries++;
      }
    }
    // Only display up to 10 new unique movies
    const toDisplay = newMovies.slice(0, 10);
    toDisplay.forEach(item => {
      const key = item.imdbID || item.tmdbID || item.id || item.title + (item.releaseYear || '');
      shownMovieKeys.add(key);
    });
    displayGenreFilterResults(toDisplay, clear && displayIndex === 0);
    displayIndex += toDisplay.length;
    // Show or hide Load More button
    if (toDisplay.length === 10) {
      loadMoreBtn.classList.remove('hidden');
    } else {
      loadMoreBtn.classList.add('hidden');
    }
  } catch (err) {
    genreFilterResults.innerHTML = `<p style=\"color:red;\">Error: ${err.message}</p>`;
    loadMoreBtn.classList.add('hidden');
  }
}

function displayResults(data) {
  if (!Array.isArray(data) || data.length === 0) {
    resultsDiv.innerHTML = '<p>No results found.</p>';
    return;
  }
  resultsDiv.innerHTML = '';
  data.forEach(movie => {
    const title = movie.title || movie.originalTitle || 'Untitled';
    const year = movie.releaseYear || '';
    const overview = movie.overview || '';
    const rating = typeof movie.rating === 'number' ? (movie.rating / 10).toFixed(1) : 'N/A';
    const runtime = movie.runtime ? `${movie.runtime} min` : 'N/A';
    let links = '';
    const streamingOptions = movie.streamingOptions?.us || [];
    const shownServices = new Set();
    if (Array.isArray(streamingOptions) && streamingOptions.length > 0) {
      streamingOptions.forEach(opt => {
        let serviceName = '';
        if (typeof opt.service === 'string') {
          serviceName = opt.service.charAt(0).toUpperCase() + opt.service.slice(1);
        } else if (opt.service && opt.service.name) {
          serviceName = opt.service.name;
        } else {
          serviceName = 'Unknown';
        }
        if (opt.link && !shownServices.has(serviceName)) {
          links += `<a href="${opt.link}" target="_blank" class="text-red-400 hover:text-yellow-400 transition-colors no-underline">${serviceName}</a> `;
          shownServices.add(serviceName);
        }
      });
    }
    function getBestImage(imageObj) {
      if (!imageObj) return '';
      const resOrder = ['w1440', 'w1080', 'w720', 'w600', 'w480', 'w360', 'w240'];
      for (const res of resOrder) {
        if (imageObj[res] && imageObj[res].startsWith('http')) return imageObj[res];
      }
      return '';
    }
    let poster = '';
    if (movie.imageSet) {
      poster = getBestImage(movie.imageSet.verticalPoster)
        || getBestImage(movie.imageSet.horizontalPoster)
        || getBestImage(movie.imageSet.verticalBackdrop)
        || getBestImage(movie.imageSet.horizontalBackdrop)
        || '';
    }
    let posterImg = '';
    if (poster) {
      posterImg = `<img src="${poster}" alt="${title}" onerror="this.style.display='none'" />`;
    }
    resultsDiv.innerHTML += `
      <div class="movie bg-gray-900/80 rounded-xl shadow-lg p-4 mb-6 flex gap-4 items-start">
        ${posterImg}
        <div class="movie-details flex-1">
          <div class="movie-title text-xl font-semibold mb-1">${title} ${year ? '(' + year + ')' : ''}</div>
          <div class="movie-meta text-gray-400 mb-2"><strong>Rating:</strong> ${rating} &nbsp; <strong>Runtime:</strong> ${runtime}</div>
          <div class="movie-meta mb-2">${overview}</div>
          <div class="streaming-links"><strong>Streaming:</strong> ${links || '<span class=\"text-gray-500\">Not available for streaming</span>'}</div>
        </div>
      </div>
    `;
  });
}

function displayGenreFilterResults(data, clear) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    if (clear) genreFilterResults.innerHTML = '<p>No results found.</p>';
    loadMoreBtn.classList.add('hidden');
    return;
  }
  // On clear, reset the results area; otherwise, append new results
  if (clear) genreFilterResults.innerHTML = '';
  data.forEach(movie => {
    const title = movie.title || movie.originalTitle || 'Untitled';
    const year = movie.releaseYear || '';
    const overview = movie.overview || '';
    const rating = typeof movie.rating === 'number' ? (movie.rating / 10).toFixed(1) : 'N/A';
    const runtime = movie.runtime ? `${movie.runtime} min` : 'N/A';
    let links = '';
    const streamingOptions = movie.streamingOptions?.us || [];
    const shownServices = new Set();
    if (Array.isArray(streamingOptions) && streamingOptions.length > 0) {
      streamingOptions.forEach(opt => {
        let serviceName = '';
        if (typeof opt.service === 'string') {
          serviceName = opt.service.charAt(0).toUpperCase() + opt.service.slice(1);
        } else if (opt.service && opt.service.name) {
          serviceName = opt.service.name;
        } else {
          serviceName = 'Unknown';
        }
        if (opt.link && !shownServices.has(serviceName)) {
          links += `<a href="${opt.link}" target="_blank" class="text-red-400 hover:text-yellow-400 transition-colors">${serviceName}</a> `;
          shownServices.add(serviceName);
        }
      });
    }
    function getBestImage(imageObj) {
      if (!imageObj) return '';
      const resOrder = ['w1440', 'w1080', 'w720', 'w600', 'w480', 'w360', 'w240'];
      for (const res of resOrder) {
        if (imageObj[res] && imageObj[res].startsWith('http')) return imageObj[res];
      }
      return '';
    }
    let poster = '';
    if (movie.imageSet) {
      poster = getBestImage(movie.imageSet.verticalPoster)
        || getBestImage(movie.imageSet.horizontalPoster)
        || getBestImage(movie.imageSet.verticalBackdrop)
        || getBestImage(movie.imageSet.horizontalBackdrop)
        || '';
    }
    let posterImg = '';
    if (poster) {
      posterImg = `<img src=\"${poster}\" alt=\"${title}\" onerror=\"this.style.display='none'\" />`;
    }
    genreFilterResults.innerHTML += `
      <div class=\"movie bg-gray-900/80 rounded-xl shadow-lg p-4 mb-6 flex gap-4 items-start\">
        ${posterImg}
        <div class=\"movie-details flex-1\">
          <div class=\"movie-title text-xl font-semibold mb-1\">${title} ${year ? '(' + year + ')' : ''}</div>
          <div class=\"movie-meta text-gray-400 mb-2\"><strong>Rating:</strong> ${rating} &nbsp; <strong>Runtime:</strong> ${runtime}</div>
          <div class=\"movie-meta mb-2\">${overview}</div>
          <div class=\"streaming-links\"><strong>Streaming:</strong> ${links || '<span class=\\"text-gray-500\\">Not available for streaming</span>'}</div>
        </div>
      </div>
    `;
  });
}
});
