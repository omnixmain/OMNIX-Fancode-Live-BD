const API_URL_OLD = 'https://raw.githubusercontent.com/IPTVFlixBD/Fancode-BD/refs/heads/main/data.json';
const API_URL_NEW = 'https://raw.githubusercontent.com/Jitendra-unatti/fancode/refs/heads/main/data/fancode.json';
const JIOHOTSTAR_URL = 'https://raw.githubusercontent.com/DebugDyno/yo_events/refs/heads/main/jiohotstar.json';
const SONY_URL = 'https://raw.githubusercontent.com/drmlive/sliv-live-events/main/sonyliv.json';
// URL for Admin Data (Change this to your external JSON URL if needed)
const ADMIN_URL = 'https://raw.githubusercontent.com/omnixmain/OMNIX-OTT-TV/refs/heads/main/admin_match.json';

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

// Privacy: Disable Right Click
document.addEventListener('contextmenu', event => event.preventDefault());

// Fetch & Merge Data
async function fetchData() {
    try {
        loading.innerHTML = '<div class="spinner"></div><p>Syncing Data (Sony + Fancode)...</p>';

        // Fetch all four concurrently
        const [resOld, resNew, resSony, resAdmin, resJio] = await Promise.allSettled([
            fetch(API_URL_OLD, { cache: "no-store" }).then(r => r.json()),
            fetch(API_URL_NEW, { cache: "no-store" }).then(r => r.json()),
            fetch(SONY_URL, { cache: "no-store" }).then(r => r.json()),
            fetch(ADMIN_URL, { cache: "no-store" }).then(r => r.json()),
            fetch(JIOHOTSTAR_URL, { cache: "no-store" }).then(r => r.json())
        ]);

        const oldMatches = (resOld.status === 'fulfilled' && resOld.value.matches) ? resOld.value.matches : [];
        const newMatches = (resNew.status === 'fulfilled' && resNew.value.matches) ? resNew.value.matches : [];
        const sonyMatches = (resSony.status === 'fulfilled' && resSony.value.matches) ? resSony.value.matches : [];
        const adminMatches = (resAdmin.status === 'fulfilled' && resAdmin.value.matches) ? resAdmin.value.matches : [];
        const jioMatches = (resJio.status === 'fulfilled' && resJio.value.success && resJio.value.data) ? resJio.value.data : [];

        console.log(`Fetched: ${oldMatches.length} old, ${newMatches.length} new, ${sonyMatches.length} sony, ${adminMatches.length} admin, ${jioMatches.length} jio matches.`);

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

                // Prefer new logos
                if (t1Logo) existing.team1_logo = t1Logo;
                if (t2Logo) existing.team2_logo = t2Logo;
                if (t1Name) existing.team1_name = t1Name;
                if (t2Name) existing.team2_name = t2Name;

                // Prefer New Image if high res
                if (m.image_cdn?.BG_IMAGE) existing.image = m.image_cdn.BG_IMAGE;

                // Merge Streams: prioritizing new ones
                newStreams.forEach(ns => {
                    const isDup = existing.streams.find(s => s.url === ns.url);
                    if (!isDup) existing.streams.unshift(ns);
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

        // 3. Process SONY matches (Distinct Source, Add to Map)
        sonyMatches.forEach(m => {
            const id = String(m.contentId);

            // Extract Teams from 'match_name' if possible (e.g. "A vs B - ...")
            let t1Name = 'Team 1', t2Name = 'Team 2';
            if (m.match_name && m.match_name.includes(' vs ')) {
                const teamsPart = m.match_name.split(' - ')[0]; // remove date text
                const parts = teamsPart.split(' vs ');
                if (parts.length >= 2) {
                    t1Name = parts[0];
                    t2Name = parts[1];
                }
            }

            const sonyEntry = {
                id: id,
                title: m.match_name,
                match_name: m.match_name,
                event_name: m.event_name,
                category: m.event_category || 'SonyLIV',
                status: m.isLive ? 'LIVE' : 'UPCOMING',
                startTime: m.isLive ? 'LIVE NOW' : 'Upcoming',
                image: m.src,

                team1_name: t1Name,
                team2_name: t2Name,
                team1_logo: null, // No logos in Sony JSON
                team2_logo: null,

                streams: []
            };

            // Add Streams
            if (m.video_url) {
                sonyEntry.streams.push({
                    name: "SonyLIV HD",
                    url: m.video_url,
                    type: 'adfree'
                });
            }
            if (m.dai_url && m.dai_url !== m.video_url) {
                sonyEntry.streams.push({
                    name: "SonyLIV Backup",
                    url: m.dai_url,
                    type: 'ads'
                });
            }

            // Add to map (Sony IDs are likely unique from Fancode, so safe to set)
            mergedMap.set(id, sonyEntry);
        });

        // 3.5 Process JIOHOTSTAR matches
        jioMatches.forEach(m => {
            const id = String(m.contentId);

            // Extract Teams from title (e.g. "India W vs Sri Lanka W: 3rd T20I")
            let t1Name = 'Team 1', t2Name = 'Team 2';
            const title = m.title || '';
            if (title.includes(' vs ')) {
                const parts = title.split(':')[0].split(' vs '); // Remove trailing ": 3rd T20I" etc
                if (parts.length >= 2) {
                    t1Name = parts[0];
                    t2Name = parts[1];
                }
            }

            const jioEntry = {
                id: id,
                title: m.title,
                match_name: m.title,
                event_name: m.description ? m.description.substring(0, 50) + "..." : 'JioHotstar Event',
                category: ((m.tags && m.tags.includes('Cricket')) ? 'Cricket' : (m.tags && m.tags.includes('Football')) ? 'Football' : 'Sports'),
                status: m.status === 'LIVE' ? 'LIVE' : 'UPCOMING',
                startTime: m.isLive ? 'LIVE NOW' : 'Upcoming',
                image: m.image || m.poster,

                team1_name: t1Name,
                team2_name: t2Name,
                team1_logo: null,
                team2_logo: null,

                streams: []
            };

            if (m.watch_url) {
                jioEntry.streams.push({
                    name: "JioHotstar Web",
                    url: m.watch_url,
                    type: 'web' // Custom type to indicate web/iframe necessity
                });
            }

            mergedMap.set(id, jioEntry);
        });

        // 4. Process ADMIN matches (Highest Priority - Overrides others)
        adminMatches.forEach(m => {
            const id = m.match_id || m.title;
            // Normalize current admin match data
            const adminEntry = {
                id: id,
                title: m.title || m.match_name,
                match_name: m.match_name || m.title,
                event_name: m.event_name || m.event_category || 'Admin Event',
                category: m.event_category || 'Special',
                status: m.status || 'LIVE',
                startTime: m.startTime || 'NOW',
                image: m.src || 'https://via.placeholder.com/300?text=Special+Event',

                team1_name: m.team_1 || 'Team A',
                team2_name: m.team_2 || 'Team B',
                team1_logo: m.team_1_logo || m.team_1_flag,
                team2_logo: m.team_2_logo || m.team_2_flag,

                streams: []
            };

            // Add Streams
            if (m.adfree_url) adminEntry.streams.push({ name: "Admin Stream 1", url: m.adfree_url, type: 'adfree' });
            if (m.dai_url) adminEntry.streams.push({ name: "Admin Stream 2", url: m.dai_url, type: 'ads' });

            // Overwrite or Add to Map
            // We use 'set' to overwrite if ID exists, effectively implementing "update via URL" for specific matches if IDs match.
            mergedMap.set(String(id), adminEntry);
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
            const isWeb = stream.type === 'web';

            // Allow styling for web streams if needed, or default to standard look
            btn.className = `stream-btn ${isAdFree ? 'ad-free' : (isWeb ? 'web-stream' : 'with-ads')}`;

            const iconClass = isAdFree ? 'fa-crown' : (isWeb ? 'fa-globe' : 'fa-play-circle');
            const serverLabel = stream.name || `Server ${index + 1}`;
            const typeLabel = isAdFree ? 'Premium / Fast' : (isWeb ? 'Official Web' : 'Standard Stream');

            btn.innerHTML = `
                <i class="fa-solid ${iconClass}"></i>
                <div>
                    <span>${serverLabel}</span>
                    <small>${typeLabel}</small>
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

// --- TELEGRAM MODAL & AD REDIRECT LOGIC ---

const AD_URL = 'https://otieu.com/4/10247206';
const TELEGRAM_URL = 'https://t.me/omnix_Empire';

// Telegram Modal Control
const telegramModal = document.getElementById('telegramModal');
const joinTelegramBtn = document.getElementById('joinTelegramBtn');

function showTelegramModal() {
    telegramModal.classList.add('active');
}

function closeTelegramModal() {
    telegramModal.classList.remove('active');
}

// Initial Load & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    // Note: Particles are now handled by particles-init.js

    // Show Telegram Modal on Load
    showTelegramModal();
});

// Join Button Click: Open Telegram & Close Modal
joinTelegramBtn.addEventListener('click', () => {
    closeTelegramModal();
});


// 1. FIRST CLICK REDIRECT (Anywhere)
let firstClickDone = false;

window.addEventListener('click', (e) => {
    if (firstClickDone) return; // Only process the very first click

    // Check if the click is NOT on the join button (to avoid double opening or blocking join)
    // However, user requirement says "first click anywhere... take to ad". 
    // If we want to allow them to click Join first, we might strictly wait for the modal to close.
    // BUT the requirement is "jo users ake aha click kare unko phele ads website par le jao"
    // "koi bhi kahi bhi pheli bar click kare button nahi hai waha click kare usko is link par le jao"

    // Safety: If they click the JOIN button, let that handle the Telegram open.
    // If they click anywhere else (like background, or if they close modal somehow), force ad.
    // Since modal covers everything, they HAVE to click 'Join' or the modal backdrop.

    // Implementation:
    // If the modal is ACTIVE, we probably shouldn't hijack the 'Join' button to show an ad instead of Telegram,
    // because then they can't join. 
    // Let's assume 'First Click' applies to the interaction with the main site OR if they click blindly.

    // REFINED STRATEGY based on request:
    // "users... click anywhere... take to ad first"
    // "Telegram joining popup... button rakho jab tak join na kare open na ho"

    // So:
    // 1. User sees blocking modal.
    // 2. User MUST click 'Join Channel'. 
    //    - If this click triggers the Ad, they get the Ad tab AND Telegram tab? Or just Ad?
    //    - If just Ad, they still haven't joined.
    //    - Better UX: 'Join' opens Telegram. 
    // 3. User comes back. Now they browse.
    // 4. NEXT click anywhere triggers the Ad (or maybe the Join click triggered it too).

    // Let's set a flag in sessionStorage to track if they've seen the ad this session?
    // User says "pheli bar click kare... usko is link par le jao".

    if (!e.target.closest('#joinTelegramBtn')) {
        // If they click something that is NOT the join button
        e.preventDefault();
        e.stopPropagation();

        window.open(AD_URL, '_blank');
        firstClickDone = true;

        // If it was an interactive element, they might need to click again.
        // This 'intercept' behavior is typical for these ad scripts.
    }
}, { capture: true }); // Capture phase to catch it before other element handlers


// 2. 15-MINUTE RECURRING AD
setInterval(() => {
    window.open(AD_URL, '_blank');
}, 15 * 60 * 1000); // 15 minutes * 60 seconds * 1000 ms

