const KAABA = Object.freeze({ lat: 21.422487, lng: 39.826206 });
const DEG = "\u00b0";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const PRAYER_METHOD = Object.freeze({ fajrAngle: 18, ishaAngle: 17, asrFactor: 1 });

const state = {
    location: null,
    qiblaBearing: 0,
    distanceKm: 0,
    heading: null,
    compassActive: false,
    simulation: false,
    sensorSource: "none",
    activeMode: "gps",
    activePage: "home",
    timeZone: null,
    timeZoneRequestId: 0,
    prayerTimes: [],
    prayerDateKey: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
    compass: $("#compass"),
    tickLayer: $("#tickLayer"),
    locationStatusPill: $("#locationStatusPill"),
    locationStatus: $("#locationStatus"),
    locationName: $("#locationName"),
    locateBtn: $("#locateBtn"),
    gpsPanelBtn: $("#gpsPanelBtn"),
    enableCompassBtn: $("#enableCompassBtn"),
    calibrateBtn: $("#calibrateBtn"),
    shareBtn: $("#shareBtn"),
    copyBtn: $("#copyBtn"),
    bearingValue: $("#bearingValue"),
    bearingText: $("#bearingText"),
    distanceValue: $("#distanceValue"),
    distanceText: $("#distanceText"),
    headingValue: $("#headingValue"),
    sensorStatus: $("#sensorStatus"),
    turnValue: $("#turnValue"),
    turnText: $("#turnText"),
    coordinateValue: $("#coordinateValue"),
    accuracyText: $("#accuracyText"),
    turnInstruction: $("#turnInstruction"),
    headingMode: $("#headingMode"),
    citySearchForm: $("#citySearchForm"),
    citySearchInput: $("#citySearchInput"),
    citySearchBtn: $("#citySearchBtn"),
    citySearchStatus: $("#citySearchStatus"),
    cityResults: $("#cityResults"),
    manualForm: $("#manualForm"),
    manualName: $("#manualName"),
    manualLat: $("#manualLat"),
    manualLng: $("#manualLng"),
    simulateToggle: $("#simulateToggle"),
    headingSlider: $("#headingSlider"),
    simHeadingValue: $("#simHeadingValue"),
    formulaText: $("#formulaText"),
    homeBearing: $("#homeBearing"),
    homeNextPrayer: $("#homeNextPrayer"),
    prayerLocationName: $("#prayerLocationName"),
    gregorianDate: $("#gregorianDate"),
    hijriDate: $("#hijriDate"),
    nextPrayerName: $("#nextPrayerName"),
    countdownText: $("#countdownText"),
    prayerTimezone: $("#prayerTimezone"),
    scheduleStatus: $("#scheduleStatus"),
    prayerFajr: $("#prayerFajr"),
    prayerSunrise: $("#prayerSunrise"),
    prayerDhuhr: $("#prayerDhuhr"),
    prayerAsr: $("#prayerAsr"),
    prayerMaghrib: $("#prayerMaghrib"),
    prayerIsha: $("#prayerIsha"),
    calibrationDialog: $("#calibrationDialog"),
    closeDialogBtn: $("#closeDialogBtn"),
    doneCalibrationBtn: $("#doneCalibrationBtn"),
    toast: $("#toast"),
    prayerInfo: $(".prayer-info")
};

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function toDeg(rad) {
    return (rad * 180) / Math.PI;
}

function normalizeAngle(deg) {
    return ((deg % 360) + 360) % 360;
}

function signedAngle(deg) {
    return ((deg + 540) % 360) - 180;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function calculateBearing(lat, lng) {
    const phi1 = toRad(lat);
    const phi2 = toRad(KAABA.lat);
    const deltaLng = toRad(KAABA.lng - lng);
    const y = Math.sin(deltaLng) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
    return normalizeAngle(toDeg(Math.atan2(y, x)));
}

function calculateDistanceKm(lat, lng) {
    const earthRadiusKm = 6371.0088;
    const dLat = toRad(KAABA.lat - lat);
    const dLng = toRad(KAABA.lng - lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDeg(value, digits = 1) {
    return `${normalizeAngle(value).toFixed(digits)}${DEG}`;
}

function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 100) return `${km.toFixed(1)} km`;
    return `${Math.round(km).toLocaleString("id-ID")} km`;
}

function compassPoint(deg) {
    const points = [
        "Utara",
        "Utara timur laut",
        "Timur laut",
        "Timur timur laut",
        "Timur",
        "Timur tenggara",
        "Tenggara",
        "Selatan tenggara",
        "Selatan",
        "Selatan barat daya",
        "Barat daya",
        "Barat barat daya",
        "Barat",
        "Barat barat laut",
        "Barat laut",
        "Utara barat laut"
    ];
    return points[Math.round(normalizeAngle(deg) / 22.5) % 16];
}

function turnPhrase(relativeDeg) {
    const abs = Math.abs(relativeDeg);
    if (abs <= 2) return { value: "Tepat", detail: "Ponsel sudah mengarah ke kiblat." };
    const side = relativeDeg > 0 ? "kanan" : "kiri";
    return { value: `${Math.round(abs)}${DEG}`, detail: `Putar ${side}` };
}

function createTicks() {
    if (!els.tickLayer || els.tickLayer.childElementCount > 0) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 72; i += 1) {
        const tick = document.createElement("span");
        tick.className = "tick";
        if (i % 6 === 0) tick.classList.add("major");
        else if (i % 3 === 0) tick.classList.add("minor");
        tick.style.setProperty("--a", `${i * 5}deg`);
        fragment.appendChild(tick);
    }
    els.tickLayer.appendChild(fragment);
}

function navigateTo(page, push = true) {
    const target = ["home", "compass", "prayer", "guide", "about"].includes(page) ? page : "home";
    state.activePage = target;

    $$(".page-section").forEach((section) => {
        const active = section.dataset.page === target;
        section.hidden = !active;
        section.classList.toggle("active", active);
    });
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.pageTarget === target));

    if (els.prayerInfo) {
        const showPrayerInfo = target === "home" || target === "prayer";
        els.prayerInfo.hidden = !showPrayerInfo;
    }

    if (push) {
        history.replaceState(null, "", `#${target}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function setActiveMode(mode) {
    state.activeMode = mode;
    $$(".segment").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    $$(".mode-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === mode));
}

function setLocation(location, persist = true) {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        showToast("Koordinat tidak valid. Latitude harus -90 sampai 90, longitude -180 sampai 180.");
        return;
    }

    state.location = {
        name: location.name || "Lokasi manual",
        lat,
        lng,
        accuracy: location.accuracy,
        source: location.source || "manual",
        detail: location.detail || ""
    };
    state.qiblaBearing = calculateBearing(lat, lng);
    state.distanceKm = calculateDistanceKm(lat, lng);
    state.timeZone = createEstimatedTimeZone(lng);
    state.prayerDateKey = "";

    if (persist) {
        try {
            localStorage.setItem("qibla-location", JSON.stringify(state.location));
        } catch (error) {
            showToast("Lokasi dihitung, tetapi browser tidak mengizinkan penyimpanan lokal.");
        }
    }

    render();
    updateTimeZoneFromNetwork(state.location);
}

function render() {
    if (!state.location) return;

    const loc = state.location;
    const heading = Number.isFinite(state.heading) ? normalizeAngle(state.heading) : 0;
    const relative = Number.isFinite(state.heading) ? signedAngle(state.qiblaBearing - heading) : state.qiblaBearing;
    const needleAngle = Number.isFinite(state.heading) ? relative : state.qiblaBearing;

    els.compass?.style.setProperty("--heading-angle", `${heading}deg`);
    els.compass?.style.setProperty("--qibla-angle", `${state.qiblaBearing}deg`);
    els.compass?.style.setProperty("--needle-angle", `${needleAngle}deg`);

    setText(els.locationName, loc.name);
    setText(els.bearingValue, formatDeg(state.qiblaBearing));
    setText(els.bearingText, `${compassPoint(state.qiblaBearing)} dari utara sejati`);
    setText(els.distanceValue, formatDistance(state.distanceKm));
    setText(els.distanceText, "Menuju Ka'bah di Makkah");
    setText(els.coordinateValue, `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
    setText(
        els.formulaText,
        `Bearing ${formatDeg(state.qiblaBearing)} dihitung dari ${loc.name} menuju koordinat Ka'bah ${KAABA.lat}${DEG} LU, ${KAABA.lng}${DEG} BT.`
    );
    setText(els.homeBearing, `Arah ${formatDeg(state.qiblaBearing)} dari ${loc.name}.`);
    setText(els.prayerLocationName, loc.name);

    updateLocationStatus();
    updateHeadingStatus(relative);
    renderPrayerSchedule();
}

function renderEmptyState() {
    els.compass?.style.removeProperty("--heading-angle");
    els.compass?.style.removeProperty("--qibla-angle");
    els.compass?.style.removeProperty("--needle-angle");

    setText(els.locationName, "Lokasi belum diatur");
    setText(els.bearingValue, "-");
    setText(els.bearingText, "Aktifkan lokasi untuk melihat arah kiblat");
    setText(els.distanceValue, "-");
    setText(els.distanceText, "Menuju Ka'bah di Makkah");
    setText(els.coordinateValue, "-");
    setText(els.formulaText, "Arah kiblat akan dihitung setelah lokasi diaktifkan.");
    setText(els.homeBearing, "Lokasi belum diatur.");
    setText(els.prayerLocationName, "-");

    setText(els.gregorianDate, "-");
    setText(els.hijriDate, "-");
    setText(els.nextPrayerName, "-");
    setText(els.countdownText, "Aktifkan lokasi untuk melihat jadwal salat.");
    setText(els.prayerTimezone, "-");
    setText(els.scheduleStatus, "Belum ada lokasi. Gunakan GPS, cari kota, atau masukkan koordinat manual.");
    setText(els.homeNextPrayer, "Jadwal belum tersedia.");

    ["prayerFajr", "prayerSunrise", "prayerDhuhr", "prayerAsr", "prayerMaghrib", "prayerIsha"].forEach((key) => {
        setText(els[key], "-");
    });

    updateHeadingStatus(0);
}

function setText(element, text) {
    if (element) element.textContent = text;
}

function updateLocationStatus() {
    const loc = state.location;
    els.locationStatusPill?.classList.remove("good", "warn");

    if (loc.source === "gps") {
        setText(els.locationStatus, "GPS aktif ");
        els.locationStatusPill?.classList.add("good");
        setText(
            els.accuracyText,
            Number.isFinite(loc.accuracy) ? `Akurasi GPS sekitar ${Math.round(loc.accuracy)} m` : "GPS aktif, akurasi tidak tersedia"
        );
        return;
    }

    if (loc.source === "geocode") {
        setText(els.locationStatus, "Kota dipilih");
        els.locationStatusPill?.classList.add("good");
        setText(els.accuracyText, loc.detail ? `Hasil pencarian: ${loc.detail}` : `Kota dipilih: ${loc.name}`);
        return;
    }

    setText(els.locationStatus, "Koordinat manual");
    els.locationStatusPill?.classList.add("good");
    setText(els.accuracyText, "Koordinat dari input manual");
}

function updateHeadingStatus(relative) {
    if (!Number.isFinite(state.heading)) {
        setText(els.headingValue, "Peta");
        setText(els.sensorStatus, "Sensor belum aktif");
        setText(els.turnValue, "-");
        setText(els.turnText, "Aktifkan kompas untuk panduan langsung");
        setText(els.turnInstruction, "Arah emas menunjukkan kiblat dengan utara di bagian atas.");
        setText(els.headingMode, "Mode peta");
        return;
    }

    const turn = turnPhrase(relative);
    setText(els.headingValue, formatDeg(state.heading, 0));
    setText(els.sensorStatus, state.simulation ? "Simulasi arah aktif" : `Sensor ${state.sensorSource}`);
    setText(els.turnValue, turn.value);
    setText(els.turnText, turn.detail);
    setText(els.headingMode, state.simulation ? "Simulasi" : "Kompas aktif");

    if (Math.abs(relative) <= 2) {
        setText(els.turnInstruction, "Tepat. Bagian atas perangkat sudah mengarah ke kiblat.");
    } else {
        const side = relative > 0 ? "kanan" : "kiri";
        const tone = Math.abs(relative) <= 15 ? "Sedikit" : "Putar";
        setText(els.turnInstruction, `${tone} ke ${side} ${Math.round(Math.abs(relative))} derajat sampai panah emas lurus ke atas.`);
    }
}

function showToast(message) {
    setText(els.toast, message);
    els.toast?.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => els.toast?.classList.remove("show"), 3600);
}

function setLoading(button, loading, loadingText = "Mencari...") {
    if (!button) return;
    button.disabled = loading;
    button.dataset.originalText ||= button.textContent.trim();
    const label = button.querySelector("span");
    if (loading) {
        label ? (label.textContent = loadingText) : (button.textContent = loadingText);
    } else if (label) {
        label.textContent = button.dataset.originalText;
    } else {
        button.textContent = button.dataset.originalText;
    }
}

function detectLocation() {
    if (!("geolocation" in navigator)) {
        showToast("Browser ini belum mendukung geolokasi. Gunakan input manual atau cari kota.");
        return;
    }

    setLoading(els.locateBtn, true, "Mencari...");
    setLoading(els.gpsPanelBtn, true, "Mencari...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setLocation({
                name: "Lokasi saya",
                lat: latitude,
                lng: longitude,
                accuracy,
                source: "gps"
            });
            setLoading(els.locateBtn, false);
            setLoading(els.gpsPanelBtn, false);
            showToast("Lokasi berhasil diperbarui.");
        },
        (error) => {
            setLoading(els.locateBtn, false);
            setLoading(els.gpsPanelBtn, false);
            const messages = {
                1: "Izin lokasi ditolak. Cari kota atau isi koordinat manual.",
                2: "Lokasi tidak tersedia. Coba lagi di area terbuka.",
                3: "Pencarian lokasi terlalu lama. Coba lagi atau gunakan input manual."
            };
            showToast(messages[error.code] || "Gagal membaca lokasi perangkat.");
        },
        { enableHighAccuracy: true, timeout: 14000, maximumAge: 30000 }
    );
}

async function searchCity(event) {
    event.preventDefault();
    const query = els.citySearchInput?.value.trim();
    if (!query || query.length < 2) {
        setText(els.citySearchStatus, "Masukkan minimal 2 huruf nama kota.");
        return;
    }

    setText(els.citySearchStatus, "Mencari kota...");
    setLoading(els.citySearchBtn, true, "Mencari...");
    els.cityResults.replaceChildren();

    try {
        const results = await geocodeCity(query);
        if (results.length === 0) {
            setText(els.citySearchStatus, `Kota "${query}" tidak ditemukan. Periksa ejaan atau gunakan koordinat manual.`);
            return;
        }
        setText(els.citySearchStatus, `Ditemukan ${results.length} hasil. Pilih lokasi yang paling sesuai.`);
        renderCityResults(results);
    } catch (error) {
        setText(els.citySearchStatus, "Pencarian kota gagal. Periksa koneksi internet, lalu coba lagi.");
    } finally {
        setLoading(els.citySearchBtn, false);
    }
}

async function geocodeCity(query) {
    const cache = readCache("qibla-geocode-cache-v1");
    const cacheKey = query.toLowerCase();
    if (Array.isArray(cache[cacheKey])) return cache[cacheKey];

    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("featureType", "settlement");
    url.searchParams.set("accept-language", "id,en");

    const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);

    const data = await response.json();
    const results = data
        .map((item) => normalizeGeocodeResult(item))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    cache[cacheKey] = results;
    writeCache("qibla-geocode-cache-v1", cache);
    return results;
}

function normalizeGeocodeResult(item) {
    const address = item.address || {};
    const cityName =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state ||
        item.name ||
        item.display_name?.split(",")[0] ||
        "Lokasi";
    const detail = [address.state, address.country].filter(Boolean).join(", ");
    return {
        name: cityName,
        detail,
        displayName: item.display_name || cityName,
        lat: Number(item.lat),
        lng: Number(item.lon)
    };
}

function renderCityResults(results) {
    const fragment = document.createDocumentFragment();
    results.forEach((result) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "city-result";

        const name = document.createElement("strong");
        name.textContent = result.name;
        const detail = document.createElement("small");
        detail.textContent = `${result.displayName} (${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})`;

        button.append(name, detail);
        button.addEventListener("click", () => {
            setLocation({
                name: result.name,
                detail: result.detail || result.displayName,
                lat: result.lat,
                lng: result.lng,
                source: "geocode"
            });
            setText(els.citySearchStatus, `${result.name} dipilih. Arah kiblat dan waktu salat sudah diperbarui.`);
            showToast(`Lokasi diperbarui ke ${result.name}.`);
        });
        fragment.appendChild(button);
    });
    els.cityResults.replaceChildren(fragment);
}

function readCache(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch (error) {
        localStorage.removeItem(key);
        return {};
    }
}

function writeCache(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        return;
    }
}

async function enableCompass() {
    if (!("DeviceOrientationEvent" in window)) {
        showToast("Sensor kompas tidak tersedia di browser ini. Gunakan mode simulasi.");
        return;
    }

    try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== "granted") {
                showToast("Izin sensor ditolak. Mode simulasi tetap bisa digunakan.");
                return;
            }
        }
    } catch (error) {
        showToast("Browser memblokir izin sensor. Coba buka lewat HTTPS atau localhost.");
        return;
    }

    state.simulation = false;
    resetHeadingSmoothing();
    els.simulateToggle.checked = false;
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    state.compassActive = true;
    els.enableCompassBtn.querySelector("span").textContent = "Kompas Aktif";
    showToast("Kompas aktif. Kalibrasi jika arah terasa tidak stabil.");
}

const HEADING_BUFFER_SIZE = 20;     // jumlah sample terakhir yang dirata-rata; makin besar makin stabil, makin lambat respon
const HEADING_DEADBAND = 3;       // derajat; perubahan di bawah ini diabaikan supaya tidak "gemetar"
const HEADING_MIN_INTERVAL_MS = 80; // jarak minimum antar update tampilan (ms)

let headingBuffer = [];
let headingRenderQueued = false;
let lastHeadingUpdateAt = 0;

function pushHeadingSample(rawHeading) {
    headingBuffer.push(rawHeading);
    if (headingBuffer.length > HEADING_BUFFER_SIZE) headingBuffer.shift();

    let sumSin = 0;
    let sumCos = 0;
    headingBuffer.forEach((h) => {
        sumSin += Math.sin(toRad(h));
        sumCos += Math.cos(toRad(h));
    });
    return normalizeAngle(toDeg(Math.atan2(sumSin / headingBuffer.length, sumCos / headingBuffer.length)));
}

function resetHeadingSmoothing() {
    headingBuffer = [];
    lastHeadingUpdateAt = 0;
}

function handleOrientation(event) {
    if (state.simulation) return;
    let heading = null;
    let source = "perangkat";

    if (typeof event.webkitCompassHeading === "number") {
        heading = event.webkitCompassHeading;
        source = "iOS";
    } else if (typeof event.alpha === "number") {
        heading = 360 - event.alpha;
        source = event.absolute ? "absolut" : "relatif";
    }

    if (!Number.isFinite(heading)) return;

    const averaged = pushHeadingSample(normalizeAngle(heading));
    state.sensorSource = source;

    const now = performance.now();
    const previous = state.heading;
    const changed = !Number.isFinite(previous) || Math.abs(signedAngle(averaged - previous)) >= HEADING_DEADBAND;
    const timeElapsed = now - lastHeadingUpdateAt >= HEADING_MIN_INTERVAL_MS;

    if (!changed || !timeElapsed) return;

    lastHeadingUpdateAt = now;
    state.heading = averaged;

    if (!headingRenderQueued) {
        headingRenderQueued = true;
        requestAnimationFrame(() => {
            headingRenderQueued = false;
            render();
        });
    }
}

function toggleSimulation(enabled) {
    state.simulation = enabled;
    resetHeadingSmoothing();
    if (enabled) {
        state.heading = Number(els.headingSlider.value);
        state.sensorSource = "simulasi";
        showToast("Simulasi arah ponsel aktif.");
    } else {
        state.heading = null;
        state.sensorSource = "none";
    }
    render();
}

function updateSimulationHeading(value) {
    setText(els.simHeadingValue, `${value}${DEG}`);
    if (!state.simulation) return;
    state.heading = Number(value);
    render();
}

function resultText() {
    const loc = state.location;
    const next = getNextPrayerInfo();
    return [
        `Arah kiblat dari ${loc.name}: ${formatDeg(state.qiblaBearing)} dari utara sejati.`,
        `Arah umum: ${compassPoint(state.qiblaBearing)}.`,
        `Jarak perkiraan ke Ka'bah: ${formatDistance(state.distanceKm)}.`,
        `Koordinat lokasi: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}.`,
        next ? `Waktu salat berikutnya: ${next.label} pukul ${next.timeLabel}.` : ""
    ].filter(Boolean).join(" ");
}

async function copyResult() {
    const text = resultText();
    try {
        await navigator.clipboard.writeText(text);
        showToast("Hasil arah kiblat dan waktu salat disalin.");
    } catch (error) {
        showToast(text);
    }
}

async function shareResult() {
    const text = resultText();
    if (navigator.share) {
        try {
            await navigator.share({ title: "Arah Kiblat dan Waktu Salat", text });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }
    await copyResult();
}

function openCalibration() {
    if (typeof els.calibrationDialog.showModal === "function") {
        els.calibrationDialog.showModal();
    } else {
        showToast("Kalibrasi: putar perangkat membentuk angka delapan lalu jauhkan dari benda magnetik.");
    }
}

function closeCalibration() {
    if (els.calibrationDialog.open) els.calibrationDialog.close();
}

function createEstimatedTimeZone(lng) {
    const offset = clamp(Math.round(lng / 15), -12, 14);
    return {
        kind: "offset",
        offset,
        label: formatUtcOffset(offset),
        source: "Perkiraan berdasarkan longitude"
    };
}

async function updateTimeZoneFromNetwork(location) {
    const requestId = ++state.timeZoneRequestId;
    const cacheKey = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    const cache = readCache("qibla-timezone-cache-v1");

    if (cache[cacheKey]) {
        state.timeZone = cache[cacheKey];
        state.prayerDateKey = "";
        renderPrayerSchedule();
        return;
    }

    try {
        const remote = await fetchTimeZone(location.lat, location.lng);
        if (requestId !== state.timeZoneRequestId || !remote) return;
        state.timeZone = remote;
        cache[cacheKey] = remote;
        writeCache("qibla-timezone-cache-v1", cache);
        state.prayerDateKey = "";
        renderPrayerSchedule();
    } catch (error) {
        if (requestId === state.timeZoneRequestId) {
            state.timeZone.source = "Perkiraan berdasarkan longitude";
            renderPrayerSchedule();
        }
    }
}

async function fetchTimeZone(lat, lng) {
    const providers = [
        `https://timeapi.io/api/TimeZone/coordinate?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`,
        `https://api.geotimezone.com/public/timezone?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`
    ];

    for (const url of providers) {
        try {
            const response = await fetch(url, { headers: { Accept: "application/json" } });
            if (!response.ok) continue;
            const data = await response.json();
            const name = data.timeZone || data.timezone || data.iana_timezone || data.ianaTimezone;
            if (name && isSupportedTimeZone(name)) {
                return {
                    kind: "iana",
                    name,
                    label: name.replace(/_/g, " "),
                    source: "Zona waktu online"
                };
            }
        } catch (error) {
            continue;
        }
    }
    return null;
}

function isSupportedTimeZone(name) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: name }).format(new Date());
        return true;
    } catch (error) {
        return false;
    }
}

function formatUtcOffset(offset) {
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const hours = String(Math.floor(abs)).padStart(2, "0");
    const minutes = String(Math.round((abs % 1) * 60)).padStart(2, "0");
    return `UTC${sign}${hours}:${minutes}`;
}

function getTimeZoneOffsetHours(timeZone, date) {
    if (!timeZone || timeZone.kind === "offset") return timeZone?.offset ?? 0;
    const parts = getDatePartsInZone(date, timeZone.name, true);
    const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return (localAsUtc - date.getTime()) / 3600000;
}

function getDatePartsInZone(date, timeZoneName, includeTime = false) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZoneName,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: includeTime ? "2-digit" : undefined,
        minute: includeTime ? "2-digit" : undefined,
        second: includeTime ? "2-digit" : undefined,
        hourCycle: includeTime ? "h23" : undefined
    });
    const values = {};
    formatter.formatToParts(date).forEach((part) => {
        if (part.type !== "literal") values[part.type] = Number(part.value);
    });
    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour ?? 0,
        minute: values.minute ?? 0,
        second: values.second ?? 0
    };
}

function getLocationDateParts(date = new Date()) {
    const timeZone = state.timeZone;
    if (timeZone?.kind === "iana") return getDatePartsInZone(date, timeZone.name, true);

    const shifted = new Date(date.getTime() + (timeZone?.offset ?? 0) * 3600000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds()
    };
}

function renderPrayerSchedule() {
    if (!state.location || !state.timeZone) return;

    const dateParts = getLocationDateParts();
    const key = `${dateParts.year}-${dateParts.month}-${dateParts.day}-${state.timeZone.label}`;
    const offsetDate = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12));
    const offset = getTimeZoneOffsetHours(state.timeZone, offsetDate);
    const prayerTimes = calculatePrayerTimes(dateParts.year, dateParts.month, dateParts.day, state.location.lat, state.location.lng, offset);

    state.prayerDateKey = key;
    state.prayerTimes = prayerTimes;

    setText(els.gregorianDate, formatGregorianDate(dateParts));
    setText(els.hijriDate, formatHijriDate());
    setText(
        els.prayerTimezone,
        `${state.location.name} (${state.timeZone.label})`
    );
    setText(
        els.scheduleStatus,
        state.timeZone.kind === "iana"
            ? "Zona waktu mengikuti lokasi. Jadwal otomatis berubah saat lokasi diperbarui."
            : "Zona waktu memakai estimasi longitude karena layanan zona waktu online belum tersedia."
    );

    const timeEls = {
        fajr: els.prayerFajr,
        sunrise: els.prayerSunrise,
        dhuhr: els.prayerDhuhr,
        asr: els.prayerAsr,
        maghrib: els.prayerMaghrib,
        isha: els.prayerIsha
    };
    prayerTimes.forEach((item) => setText(timeEls[item.key], item.valid ? item.timeLabel : "-"));
    updateNextPrayerDisplay();
}

function calculatePrayerTimes(year, month, day, lat, lng, timeZoneOffset) {
    const jDate = julianDate(year, month, day) - lng / (15 * 24);
    const riseSetAngle = 0.833;
    let times = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };

    for (let i = 0; i < 2; i += 1) {
        times = {
            fajr: sunAngleTime(jDate, lat, PRAYER_METHOD.fajrAngle, times.fajr, "ccw"),
            sunrise: sunAngleTime(jDate, lat, riseSetAngle, times.sunrise, "ccw"),
            dhuhr: midDay(jDate, times.dhuhr),
            asr: asrTime(jDate, lat, PRAYER_METHOD.asrFactor, times.asr),
            maghrib: sunAngleTime(jDate, lat, riseSetAngle, times.maghrib, "cw"),
            isha: sunAngleTime(jDate, lat, PRAYER_METHOD.ishaAngle, times.isha, "cw")
        };
    }

    times = adjustHighLatitudeTimes(times);

    return [
        makePrayer("fajr", "Subuh", times.fajr, lng, timeZoneOffset),
        makePrayer("sunrise", "Terbit", times.sunrise, lng, timeZoneOffset),
        makePrayer("dhuhr", "Zuhur", times.dhuhr, lng, timeZoneOffset),
        makePrayer("asr", "Asar", times.asr, lng, timeZoneOffset),
        makePrayer("maghrib", "Magrib", times.maghrib, lng, timeZoneOffset),
        makePrayer("isha", "Isya", times.isha, lng, timeZoneOffset)
    ];
}

function adjustHighLatitudeTimes(times) {
    if (!Number.isFinite(times.sunrise) || !Number.isFinite(times.maghrib)) return times;

    const nightTime = timeDiff(times.maghrib, times.sunrise);
    const fajrPortion = PRAYER_METHOD.fajrAngle / 60;
    const ishaPortion = PRAYER_METHOD.ishaAngle / 60;
    const adjusted = { ...times };

    if (!Number.isFinite(adjusted.fajr) || timeDiff(adjusted.fajr, times.sunrise) > fajrPortion * nightTime) {
        adjusted.fajr = times.sunrise - fajrPortion * nightTime;
    }
    if (!Number.isFinite(adjusted.isha) || timeDiff(times.maghrib, adjusted.isha) > ishaPortion * nightTime) {
        adjusted.isha = times.maghrib + ishaPortion * nightTime;
    }

    return adjusted;
}

function timeDiff(fromHour, toHour) {
    return normalizeHour(toHour - fromHour);
}

function makePrayer(key, label, rawHour, lng, timeZoneOffset) {
    if (!Number.isFinite(rawHour)) {
        return { key, label, valid: false, minutes: null, timeLabel: "-" };
    }
    const adjusted = normalizeHour(rawHour + timeZoneOffset - lng / 15);
    const minutes = Math.round(adjusted * 60) % 1440;
    return { key, label, valid: true, minutes, timeLabel: formatMinutes(minutes) };
}

function julianDate(year, month, day) {
    let y = year;
    let m = month;
    if (m <= 2) {
        y -= 1;
        m += 12;
    }
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

function sunPosition(jd) {
    const d = jd - 2451545.0;
    const g = normalizeAngle(357.529 + 0.98560028 * d);
    const q = normalizeAngle(280.459 + 0.98564736 * d);
    const l = normalizeAngle(q + 1.915 * Math.sin(toRad(g)) + 0.02 * Math.sin(toRad(2 * g)));
    const e = 23.439 - 0.00000036 * d;
    const ra = normalizeHour(toDeg(Math.atan2(Math.cos(toRad(e)) * Math.sin(toRad(l)), Math.cos(toRad(l)))) / 15);
    const decl = toDeg(Math.asin(Math.sin(toRad(e)) * Math.sin(toRad(l))));
    const equation = q / 15 - ra;
    return { decl, equation };
}

function midDay(jDate, time) {
    const position = sunPosition(jDate + time / 24);
    return normalizeHour(12 - position.equation);
}

function sunAngleTime(jDate, lat, angle, time, direction) {
    const decl = sunPosition(jDate + time / 24).decl;
    const noon = midDay(jDate, time);
    const numerator = -Math.sin(toRad(angle)) - Math.sin(toRad(decl)) * Math.sin(toRad(lat));
    const denominator = Math.cos(toRad(decl)) * Math.cos(toRad(lat));
    const ratio = numerator / denominator;
    if (ratio < -1 || ratio > 1) return Number.NaN;
    const diff = toDeg(Math.acos(ratio)) / 15;
    return noon + (direction === "ccw" ? -diff : diff);
}

function asrTime(jDate, lat, factor, time) {
    const decl = sunPosition(jDate + time / 24).decl;
    const angle = -toDeg(Math.atan(1 / (factor + Math.tan(toRad(Math.abs(lat - decl))))));
    return sunAngleTime(jDate, lat, angle, time, "cw");
}

function normalizeHour(hour) {
    return ((hour % 24) + 24) % 24;
}

function formatMinutes(minutes) {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatGregorianDate(parts) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(date);
}

function formatHijriDate() {
    const timeZone = state.timeZone;
    const options = { day: "numeric", month: "long", year: "numeric" };
    try {
        if (timeZone?.kind === "iana") {
            return new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", { ...options, timeZone: timeZone.name }).format(new Date());
        }
        const shifted = new Date(Date.now() + (timeZone?.offset ?? 0) * 3600000);
        return new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", { ...options, timeZone: "UTC" }).format(shifted);
    } catch (error) {
        return "Tanggal Hijriah tidak tersedia di browser ini";
    }
}

function getNextPrayerInfo() {
    const validPrayers = state.prayerTimes.filter((item) => item.valid && item.key !== "sunrise");
    if (validPrayers.length === 0) return null;

    const now = getLocationDateParts();
    const nowSeconds = now.hour * 3600 + now.minute * 60 + now.second;
    const today = validPrayers.map((item) => ({ ...item, diffSeconds: item.minutes * 60 - nowSeconds, tomorrow: false }));
    let next = today.find((item) => item.diffSeconds >= 0);

    if (!next) {
        const tomorrowParts = addDays(now, 1);
        const offsetDate = new Date(Date.UTC(tomorrowParts.year, tomorrowParts.month - 1, tomorrowParts.day, 12));
        const offset = getTimeZoneOffsetHours(state.timeZone, offsetDate);
        const tomorrowTimes = calculatePrayerTimes(tomorrowParts.year, tomorrowParts.month, tomorrowParts.day, state.location.lat, state.location.lng, offset)
            .filter((item) => item.valid && item.key !== "sunrise");
        next = { ...tomorrowTimes[0], diffSeconds: 24 * 3600 - nowSeconds + tomorrowTimes[0].minutes * 60, tomorrow: true };
    }

    return next;
}

function addDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function updateNextPrayerDisplay() {
    const next = getNextPrayerInfo();
    $$(".prayer-time-card").forEach((card) => card.classList.remove("active"));

    if (!next) {
        setText(els.nextPrayerName, "-");
        setText(els.countdownText, "Jadwal tidak tersedia untuk lokasi/tanggal ini.");
        setText(els.homeNextPrayer, "Jadwal belum tersedia.");
        return;
    }

    const suffix = next.tomorrow ? " besok" : "";
    setText(els.nextPrayerName, `${next.label}${suffix}`);
    setText(els.countdownText, `${next.timeLabel} - ${formatCountdown(next.diffSeconds)} lagi`);
    setText(els.homeNextPrayer, `${next.label}${suffix} pukul ${next.timeLabel}.`);
    $(`.prayer-time-card[data-prayer-key="${next.key}"]`)?.classList.add("active");
}

function formatCountdown(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function tickPrayerCountdown() {
    if (!state.location) return;
    const parts = getLocationDateParts();
    const currentKey = `${parts.year}-${parts.month}-${parts.day}-${state.timeZone?.label || ""}`;
    if (state.prayerDateKey && currentKey !== state.prayerDateKey) {
        renderPrayerSchedule();
        return;
    }
    updateNextPrayerDisplay();
}

function wireEvents() {
    $$("[data-page-target]").forEach((button) => {
        button.addEventListener("click", () => navigateTo(button.dataset.pageTarget));
    });

    els.locateBtn.addEventListener("click", detectLocation);
    els.gpsPanelBtn.addEventListener("click", detectLocation);
    els.enableCompassBtn.addEventListener("click", enableCompass);
    els.calibrateBtn.addEventListener("click", openCalibration);
    els.closeDialogBtn.addEventListener("click", closeCalibration);
    els.doneCalibrationBtn.addEventListener("click", closeCalibration);
    els.copyBtn.addEventListener("click", copyResult);
    els.shareBtn.addEventListener("click", shareResult);
    els.citySearchForm.addEventListener("submit", searchCity);

    $$(".segment").forEach((button) => {
        button.addEventListener("click", () => setActiveMode(button.dataset.mode));
    });

    els.manualForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setLocation({
            name: els.manualName.value.trim() || "Lokasi manual",
            lat: els.manualLat.value,
            lng: els.manualLng.value,
            source: "manual"
        });
    });

    els.simulateToggle.addEventListener("change", (event) => toggleSimulation(event.target.checked));
    els.headingSlider.addEventListener("input", (event) => updateSimulationHeading(event.target.value));
    window.addEventListener("hashchange", () => navigateTo(location.hash.replace("#", ""), false));
}

function loadInitialLocation() {
    try {
        const saved = JSON.parse(localStorage.getItem("qibla-location"));

        if (
            saved &&
            Number.isFinite(saved.lat) &&
            Number.isFinite(saved.lng)
        ) {
            setLocation(saved, false);
            return;
        }
    } catch (error) {
        localStorage.removeItem("qibla-location");
    }

    state.location = null;
    state.timeZone = null;
    state.qiblaBearing = 0;
    state.distanceKm = 0;
    state.prayerTimes = [];
    state.prayerDateKey = "";

    renderEmptyState();
}

function init() {
    createTicks();
    wireEvents();
    updateSimulationHeading(els.headingSlider.value);
    loadInitialLocation();
    navigateTo(location.hash.replace("#", "") || "home", false);
    setInterval(tickPrayerCountdown, 1000);
}

init();