
const API_URL_OLD = 'https://raw.githubusercontent.com/IPTVFlixBD/Fancode-BD/refs/heads/main/data.json';
const API_URL_NEW = 'https://raw.githubusercontent.com/Jitendra-unatti/fancode/refs/heads/main/data/fancode.json';

const matchesGrid = document.getElementById('matches-grid');
const loading = document.getElementById('loading');
const categoryNav = document.querySelector('.category-nav');
const searchInput = document.getElementById('searchInput');

// Modal Elements
const streamModal = document.getElementById('streamModal');
const modalMatchName = document.getElementById('modalMatchName');
const streamOptionsContainer = document.querySelector('.stream-options');

let allMatches = [];
let currentCategory = 'all';

// Fetch & Merge Data
async function fetchData() {
    try {
        loading.innerHTML = '<div class="spinner"></div><p>Syncing Data...</p>';

        // Fetch both concurrently
        const [resOld, resNew] = await Promise.allSettled([
            fetch(API_URL_OLD, { cache: "no-store" }).then(r => r.json()),
            fetch(API_URL_NEW, { cache: "no-store" }).then(r => r.json())
        ]);

        const oldMatches = (resOld.status === 'fulfilled' && resOld.value.matches) ? resOld.value.matches : [];
        const newMatches = (resNew.status === 'fulfilled' && resNew.value.matches) ? resNew.value.matches : [];

        console.log(`Fetched: ${oldMatches.length} old matches, ${newMatches.length} new matches.`);

        // MERGE LOGIC: Use a Map for O(1) lookups by match_id
        const mergedMap = new Map();

        // 1. Process OLD matches (Base)
        oldMatches.forEach(m => {
            const id = m.match_id || m.title; // Fallback ID
            mergedMap.set(String(id), {
                id: id,
                title: m.title || m.match_name,
                match_name: m.match_name || m.title,
                event_name: m.event_name || m.event_category,
                category: m.event_category || 'Sports',
                status: m.status,
                startTime: m.startTime,
                image: m.src,

                // Teams
                team1_name: m.team_1,
                team2_name: m.team_2,
                team1_logo: m.team_1_flag || m.team_1_logo,
                team2_logo: m.team_2_flag || m.team_2_logo,

                // Streams (Old source)
                streams: []
            });

            const matchEntry = mergedMap.get(String(id));

            // Add Old Streams
            if (m.adfree_url) matchEntry.streams.push({ name: "Server 1 (Ad-Free)", url: m.adfree_url, type: 'adfree' });
            if (m.dai_url) matchEntry.streams.push({ name: "Server 2 (Ads)", url: m.dai_url, type: 'ads' });
        });

        // 2. Process NEW matches (Enrich or Add)
        newMatches.forEach(m => {
            const id = String(m.match_id);

            // Extract Teams & Logos from New Structure
            let t1Name = 'Team 1', t2Name = 'Team 2';
            let t1Logo = null, t2Logo = null;

            if (m.teams && m.teams.length >= 2) {
                t1Name = m.teams[0].name;
                t1Logo = m.teams[0].flag?.src;
                t2Name = m.teams[1].name;
                t2Logo = m.teams[1].flag?.src;
            }

            // Extract Streams from New Structure
            const newStreams = [];
            if (m.STREAMING_CDN) {
                if (m.STREAMING_CDN.fancode_cdn && m.STREAMING_CDN.fancode_cdn !== 'Unavailable') {
                    newStreams.push({ name: "Server 1 (High Speed)", url: m.STREAMING_CDN.fancode_cdn, type: 'adfree' });
                }
                if (m.STREAMING_CDN.dai_google_cdn && m.STREAMING_CDN.dai_google_cdn !== 'Unavailable') {
                    newStreams.push({ name: "Server 2 (Backup)", url: m.STREAMING_CDN.dai_google_cdn, type: 'ads' });
                }
                // Fallback Primary
                if (newStreams.length === 0 && m.STREAMING_CDN.Primary_Playback_URL) {
                    newStreams.push({ name: "Server 1", url: m.STREAMING_CDN.Primary_Playback_URL, type: 'adfree' });
                }
            }

            if (mergedMap.has(id)) {
                // UPDATE existing match
                const existing = mergedMap.get(id);

                // Prefer new logos/names if available
                if (t1Logo) existing.team1_logo = t1Logo;
                if (t2Logo) existing.team2_logo = t2Logo;
                if (t1Name) existing.team1_name = t1Name;
                if (t2Name) existing.team2_name = t2Name;

                // Prefer New Image if high res
                if (m.image_cdn?.BG_IMAGE) existing.image = m.image_cdn.BG_IMAGE;

                // Merge Streams: prioritizing new ones
                newStreams.forEach(ns => {
                    const isDup = existing.streams.find(s => s.url === ns.url);
                    if (!isDup) existing.streams.unshift(ns); // Put new high-quality streams at top
                });

            } else {
                // CREATE new match (only in new json)
                mergedMap.set(id, {
                    id: id,
                    title: m.title.replace(" Vs ", " vs "),
                    match_name: m.title,
                    event_name: m.tournament,
                    category: m.category,
                    status: (m.status === 'COMPLETED' ? 'COMPLETED' : 'UPCOMING'),
                    startTime: m.startTime,
                    image: m.image || m.image_cdn?.BG_IMAGE,

                    team1_name: t1Name,
                    team2_name: t2Name,
                    team1_logo: t1Logo,
                    team2_logo: t2Logo,

                    streams: newStreams
                });
            }
        });

        // Convert Map to Array
        allMatches = Array.from(mergedMap.values());

        // Sort: LIVE first
        allMatches.sort((a, b) => {
            const aLive = a.status === 'LIVE' || a.status === 'STARTED';
            const bLive = b.status === 'LIVE' || b.status === 'STARTED';
            if (aLive && !bLive) return -1;
            if (!aLive && bLive) return 1;
            return 0;
        });

        setupCategories();
        renderMatches(allMatches);

    } catch (error) {
        console.error('Critical Merging Error:', error);
        loading.innerHTML = `<p style="color:red">Error loading data: ${error.message}</p>`;
    }
}

// Setup Categories
function setupCategories() {
    const categories = new Set(allMatches.map(m => m.category).filter(Boolean));
    const sortedCategories = Array.from(categories).sort();

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

    allBtn.onclick = () => filterByCategory('all');
}

// Filter Logic
function filterByCategory(category) {
    currentCategory = category;

    document.querySelectorAll('.cat-btn').forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyFilters();
}

searchInput.addEventListener('input', applyFilters);

function applyFilters() {
    const term = searchInput.value.toLowerCase();

    let filtered = currentCategory === 'all'
        ? allMatches
        : allMatches.filter(m => m.category === currentCategory);

    if (term) {
        filtered = filtered.filter(match => {
            const title = (match.title || '').toLowerCase();
            const t1 = (match.team1_name || '').toLowerCase();
            const t2 = (match.team2_name || '').toLowerCase();
            return title.includes(term) || t1.includes(term) || t2.includes(term);
        });
    }

    renderMatches(filtered);
}


// Render Normalized Matches
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


        const isLive = match.status === 'LIVE' || match.status === 'STARTED';
        const statusClass = isLive ? 'status-live' : 'status-upcoming';
        const statusText = isLive ? 'LIVE' : (match.status || 'UPCOMING');
        const imageSrc = match.image || 'https://via.placeholder.com/300x169?text=Fancode+Live';

        // Teams
        const t1Name = match.team1_name || 'Team 1';
        const t2Name = match.team2_name || 'Team 2';
        const t1Logo = match.team1_logo;
        const t2Logo = match.team2_logo;

        // Dynamic Sport Icon
        let sportIcon = 'fa-trophy'; // Default
        const catLower = (match.category || '').toLowerCase();
        if (catLower.includes('cricket')) sportIcon = 'fa-baseball-bat-ball';
        else if (catLower.includes('football') || catLower.includes('soccer')) sportIcon = 'fa-futbol';
        else if (catLower.includes('basket')) sportIcon = 'fa-basketball';
        else if (catLower.includes('kabaddi')) sportIcon = 'fa-running';
        else if (catLower.includes('hockey')) sportIcon = 'fa-hockey-puck';

        // Card Click Interaction
        card.onclick = () => showStreamOptions(match);

        card.innerHTML = `
            <div class="card-header-area">
                <img src="${imageSrc}" class="background-image" loading="lazy" onerror="this.src='https://via.placeholder.com/300x169?text=No+Image'">
                
                <!-- Status Badge (Top Right) -->
                <div class="status-badge ${statusClass}">
                    ${isLive ? '<i class="fa-solid fa-circle" style="font-size: 8px; margin-right: 4px;"></i>' : ''} ${statusText}
                </div>

                <!-- Sport Badge (Top Left) -->
                <div style="position: absolute; top: 12px; left: 12px; z-index: 5; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px; border: 1px solid #333; backdrop-filter: blur(4px);">
                    <i class="fa-solid ${sportIcon}" style="color: var(--gold-primary);"></i>
                    <span>${match.category || 'Sports'}</span>
                </div>

                <div class="play-overlay">
                    <i class="fa-solid fa-play"></i>
                </div>
                
                <div class="vs-overlay">
                    <div class="team-info">
                        <div class="team-logo-placeholder">
                            ${t1Logo ? `<img src="${t1Logo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '<i class="fa-solid fa-shield-halved"></i>'}
                        </div>
                        <span class="team-name">${t1Name}</span>
                    </div>
                    
                    <div class="vs-badge">VS</div>
                    
                    <div class="team-info">
                        <div class="team-logo-placeholder">
                             ${t2Logo ? `<img src="${t2Logo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '<i class="fa-solid fa-shield-halved"></i>'}
                        </div>
                        <span class="team-name">${t2Name}</span>
                    </div>
                </div>
            </div>

            <div class="card-details">
                <!-- Sport & Tournament Label -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                     <div class="event-name" style="color: var(--gold-primary); font-size: 0.8rem; font-weight:700;">
                        ${match.category || 'Sports'}
                     </div>
                     <div style="font-size: 0.7rem; color: #888;">${match.event_name || 'Tournament Info'}</div>
                </div>

                <!-- Main Title -->
                <h3 class="match-main-title" style="font-size: 1.1rem; line-height:1.3; margin-bottom: 8px;">
                    ${match.match_name || match.title}
                </h3>
                
                <!-- Tournament Subtitle (if not already shown above, but let's be explicit) -->
                <div style="font-size: 0.85rem; color: #aaa; margin-bottom: 12px; font-style: italic;">
                    ${match.event_name || match.category}
                </div>

                <!-- Footer: Date & Servers -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #222; padding-top: 10px; margin-top: auto;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div class="detail-row" style="border:none; margin:0; padding:0; font-size: 0.8rem;">
                             <i class="fa-regular fa-clock" style="color:#888; width:14px;"></i>
                             <span>${match.startTime || 'TBA'}</span>
                        </div>
                    </div>
                    
                    <div style="font-size: 0.8rem; font-weight: bold; color: #4caf50;">
                        ${match.streams.length > 0 ? `<i class="fa-solid fa-server"></i> ${match.streams.length}` : ''}
                    </div>
                </div>
            </div>
        `;

        matchesGrid.appendChild(card);
    });
}


// --- MODAL LOGIC FOR MULTIPLE SERVERS ---

function showStreamOptions(match) {
    modalMatchName.textContent = match.match_name || match.title;

    // Clear old buttons
    streamOptionsContainer.innerHTML = '';

    if (match.streams.length === 0) {
        streamOptionsContainer.innerHTML = '<p style="text-align:center;color:#666;">No streams available for this match yet.</p>';
    } else {
        // Generate buttons
        match.streams.forEach((stream, index) => {
            const btn = document.createElement('button');
            const isAdFree = stream.type === 'adfree';
            btn.className = `stream-btn ${isAdFree ? 'ad-free' : 'with-ads'}`;

            const iconClass = isAdFree ? 'fa-crown' : 'fa-play-circle';
            const serverLabel = stream.name || `Server ${index + 1}`;

            btn.innerHTML = `
                <i class="fa-solid ${iconClass}"></i>
                <div>
                    <span>${serverLabel}</span>
                    <small>${isAdFree ? 'Premium / Fast' : 'Standard Stream'}</small>
                </div>
            `;

            btn.onclick = () => openPlayer(stream.url, match.title, match.image);
            streamOptionsContainer.appendChild(btn);
        });
    }

    streamModal.classList.add('active');
}

function closeModal() {
    streamModal.classList.remove('active');
}

streamModal.addEventListener('click', (e) => {
    if (e.target === streamModal) closeModal();
});

function openPlayer(url, title, image) {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const encodedImg = encodeURIComponent(image || '');
    window.location.href = `player.html?src=${encodedUrl}&title=${encodedTitle}&img=${encodedImg}`;
    setTimeout(closeModal, 500);
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    createGoldParticles();
});

// Gold Background Animation
function createGoldParticles() {
    const container = document.getElementById('background-animation');
    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'gold-particle';

        // Random Properties
        const size = Math.random() * 5 + 2 + 'px'; // 2px to 7px
        const left = Math.random() * 100 + 'vw';
        const duration = Math.random() * 15 + 10 + 's'; // 10s to 25s
        const delay = Math.random() * 5 + 's';

        particle.style.width = size;
        particle.style.height = size;
        particle.style.left = left;
        particle.style.animationDuration = duration;
        particle.style.animationDelay = delay;

        container.appendChild(particle);
    }
}

