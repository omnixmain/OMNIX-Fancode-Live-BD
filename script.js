const API_URLS = [
    'https://raw.githubusercontent.com/IPTVFlixBD/Fancode-BD/refs/heads/main/data.json',
    'https://raw.githubusercontent.com/IPTVFlixBD/Fancode-BD/main/data.json'
];

const matchesGrid = document.getElementById('matches-grid');
const loading = document.getElementById('loading');
const categoryNav = document.querySelector('.category-nav');
const searchInput = document.getElementById('searchInput');

let allMatches = [];
let currentCategory = 'all';

// Fetch Data with Fallback
async function fetchData() {
    let errorMsg = '';

    for (const url of API_URLS) {
        try {
            console.log(`Attempting to fetch from: ${url}`);
            const response = await fetch(url, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.matches) {
                console.log('Data successfully loaded');
                allMatches = data.matches;
                setupCategories();
                renderMatches(allMatches);
                return; // Success, exit function
            } else {
                throw new Error('Invalid JSON structure: "matches" key missing');
            }
        } catch (error) {
            console.error(`Failed to fetch from ${url}:`, error);
            errorMsg = error.message;
        }
    }

    // If we reach here, all attempts failed
    loading.innerHTML = `
        <div style="text-align: center; color: #ff3b3b;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>Failed to load data.</p>
            <p style="font-size: 0.8rem; color: #888;">${errorMsg}</p>
            <button onclick="fetchData()" style="padding: 10px 20px; margin-top: 15px; background: #FFD700; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Retry</button>
        </div>
    `;
}

// Setup Categories
function setupCategories() {
    // Extract unique categories and sort them
    const categories = new Set(allMatches.map(match => match.event_category).filter(Boolean));
    const sortedCategories = Array.from(categories).sort();

    // Clear existing (except All)
    const allBtn = categoryNav.querySelector('[data-category="all"]');
    categoryNav.innerHTML = '';
    categoryNav.appendChild(allBtn);

    sortedCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn';
        btn.textContent = cat;
        btn.dataset.category = cat;
        btn.onclick = () => filterByCategory(cat);
        categoryNav.appendChild(btn);
    });

    // Re-attach event for 'All'
    allBtn.onclick = () => filterByCategory('all');
}

// Filter Logic
function filterByCategory(category) {
    currentCategory = category;

    // Update Active Class
    document.querySelectorAll('.cat-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyFilters();
}

// Search Logic
searchInput.addEventListener('input', applyFilters);

function applyFilters() {
    const term = searchInput.value.toLowerCase();

    // First filter by Category
    let filtered = currentCategory === 'all'
        ? allMatches
        : allMatches.filter(m => m.event_category === currentCategory);

    // Then filter by Search Term (Title, Team, Event)
    if (term) {
        filtered = filtered.filter(match => {
            const title = (match.title || '').toLowerCase();
            const matchName = (match.match_name || '').toLowerCase();
            const eventName = (match.event_name || '').toLowerCase();
            return title.includes(term) || matchName.includes(term) || eventName.includes(term);
        });
    }

    renderMatches(filtered);
}


// Render Matches
function renderMatches(matches) {
    matchesGrid.innerHTML = '';
    loading.style.display = 'none';

    if (matches.length === 0) {
        matchesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 2rem;">No matches found.</div>';
        return;
    }

    matches.forEach(match => {
        const card = document.createElement('div');
        card.className = 'match-card';

        // Determine Status
        const isLive = match.status === 'LIVE';
        const statusClass = isLive ? 'live-badge' : 'upcoming-badge';
        const statusText = match.status || 'UPCOMING';

        // Choose Stream URL: Prefer adfree, then dai, then nothing.
        const streamUrl = match.adfree_url || match.dai_url;

        // Click Event -> Open Player
        if (streamUrl) {
            card.onclick = () => openPlayer(streamUrl, match.title);
        } else {
            card.onclick = () => {
                alert('Stream link not available for this match yet.');
            };
            card.style.cursor = 'default';
        }

        // Fallback image
        const imageSrc = match.src || 'https://via.placeholder.com/300x169?text=No+Image';

        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${imageSrc}" alt="${match.match_name}" class="card-image" loading="lazy" onerror="this.src='https://via.placeholder.com/300x169?text=Image+Error'">
                <span class="${statusClass}">${statusText}</span>
                ${streamUrl ? `<div class="play-icon-overlay"><i class="fa-solid fa-play"></i></div>` : ''}
            </div>
            <div class="card-content">
                <div class="category-tag">${match.event_category || 'Sports'}</div>
                <h3 class="match-title">${match.title || match.match_name || 'Unknown Match'}</h3>
                <div class="match-meta">
                    <span style="display: flex; align-items: center; gap: 5px;">
                        <i class="fa-regular fa-clock"></i> ${match.startTime || 'TBA'}
                    </span>
                    ${isLive ? '<span style="color: #ff3b3b; font-weight: bold;">● LIVE</span>' : ''}
                </div>
            </div>
        `;

        matchesGrid.appendChild(card);
    });
}

function openPlayer(url, title) {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    window.location.href = `player.html?src=${encodedUrl}&title=${encodedTitle}`;
    // window.open(`player.html?src=${encodedUrl}&title=${encodedTitle}`, '_blank');
}

// Initial Load
document.addEventListener('DOMContentLoaded', fetchData);
