(() => {
  'use strict';

  const arrivalInput = document.getElementById('arrivalTime');
  const routeMinutesInput = document.getElementById('routeMinutes');
  const parkingBufferInput = document.getElementById('parkingBuffer');
  const timelineEl = document.getElementById('timeline');
  const nextStepEl = document.getElementById('nextStep');
  const nextDetailEl = document.getElementById('nextDetail');
  const statusLabelEl = document.getElementById('statusLabel');
  const countdownCaptionEl = document.getElementById('countdownCaption');
  const countdownTextEl = document.getElementById('countdownText');
  const arrivalTextEl = document.getElementById('arrivalText');
  const progressFillEl = document.getElementById('progressFill');
  const timelineSummaryEl = document.getElementById('timelineSummary');
  const driveModeBtn = document.getElementById('driveMode');
  const routeMetaEl = document.getElementById('routeMeta');
  const trafficStampEl = document.getElementById('trafficStamp');
  const trafficSheetEl = document.getElementById('trafficSheet');
  const customMinutesInput = document.getElementById('customMinutes');
  const navLink = document.querySelector('.nav-btn');
  const settingsKey = 'high-in-pwa-plan-v2';
  let awaitingTrafficReturn = false;
  let deferredInstallPrompt = null;
  let wakeLock = null;

  const pad = number => String(number).padStart(2, '0');
  const formatTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  };

  function timeToday(value, fallback) {
    const now = new Date();
    const [hour, minute] = (value || fallback).split(':').map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  }

  function getPlan() {
    const arrival = timeToday(arrivalInput.value, '12:30');
    const routeMinutes = clamp(routeMinutesInput.value, 15, 90, 28);
    const parkingBuffer = clamp(parkingBufferInput.value, 0, 30, 5);
    routeMinutesInput.value = routeMinutes;
    parkingBufferInput.value = parkingBuffer;
    const departure = addMinutes(arrival, -(routeMinutes + parkingBuffer));
    const reachArea = addMinutes(departure, routeMinutes);
    return { arrival, departure, reachArea, routeMinutes, parkingBuffer };
  }

  function buildEvents(plan) {
    const { departure, arrival, reachArea, routeMinutes } = plan;
    const opening = timeToday('13:00', '13:00');
    const coffee = addMinutes(arrival > opening ? arrival : opening, 10);
    const returnTime = addMinutes(coffee, 90);
    const events = [
      { time: departure, name: '從竹北出發', detail: '開Google Maps導航；光明六路往竹北交流道。' },
      { time: addMinutes(departure, Math.round(routeMinutes * 0.39)), name: '預計上國道1號南下', detail: '實際轉向與時間以Google Maps為準。' },
      { time: addMinutes(departure, Math.round(routeMinutes * 0.57)), name: '預計轉國道3號南下', detail: '新竹系統往竹南／西濱方向。' },
      { time: addMinutes(departure, Math.max(1, routeMinutes - 3)), name: '預計下115－西濱出口', detail: '接龍江街，最後約1.5公里道路較小。' },
      { time: reachArea, name: '抵達海邊周邊', detail: '先找基地旁空地，滿位再看龍江街273巷。' },
      { time: arrival, name: '完成停車、走到海癮', detail: '時間內已包含你設定的停車緩衝。' }
    ];
    if (arrival < opening) {
      events.push({ time: opening, name: '海癮咖啡開門', detail: '週末13:00開始營業；若天候不佳可能臨休。' });
    }
    events.push(
      { time: coffee, name: '喝咖啡、看海', detail: '若有雷雨或強風就留在基地室內區域。' },
      { time: returnTime, name: '建議準備返程', detail: '預留約90分鐘，不必趕，也避開待到太晚。' }
    );
    return events.sort((a, b) => a.time - b.time);
  }

  function minutesText(milliseconds) {
    const total = Math.max(0, Math.ceil(milliseconds / 60000));
    if (total < 60) return `${total}分鐘`;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return minutes ? `${hours}小時${minutes}分` : `${hours}小時`;
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(settingsKey) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveSettings(markTrafficUpdate = false) {
    const existing = readSettings();
    const plan = getPlan();
    localStorage.setItem(settingsKey, JSON.stringify({
      arrival: arrivalInput.value,
      routeMinutes: plan.routeMinutes,
      parkingBuffer: plan.parkingBuffer,
      updatedAt: markTrafficUpdate ? Date.now() : (existing.updatedAt || null)
    }));
  }

  function loadSettings() {
    const saved = readSettings();
    if (/^\d{2}:\d{2}$/.test(saved.arrival || '')) arrivalInput.value = saved.arrival;
    if (saved.routeMinutes) routeMinutesInput.value = clamp(saved.routeMinutes, 15, 90, 28);
    if (saved.parkingBuffer !== undefined) parkingBufferInput.value = clamp(saved.parkingBuffer, 0, 30, 5);
  }

  function updateTrafficStamp() {
    const saved = readSettings();
    const routeMinutes = clamp(routeMinutesInput.value, 15, 90, 28);
    routeMetaEl.textContent = `🚙 目前${routeMinutes}分鐘`;
    if (!saved.updatedAt) {
      trafficStampEl.textContent = '預設28分';
      return;
    }
    trafficStampEl.textContent = `更新 ${formatTime(new Date(saved.updatedAt))}`;
  }

  function update() {
    const plan = getPlan();
    const events = buildEvents(plan);
    const now = new Date();
    const { departure, arrival, reachArea, routeMinutes, parkingBuffer } = plan;
    const currentIndex = events.findIndex(item => item.time > now);

    timelineEl.innerHTML = events.map((event, index) => {
      const done = now >= event.time;
      const current = currentIndex !== -1 && index === currentIndex;
      return `<div class="timeline-item ${done ? 'done' : ''} ${current ? 'current' : ''}">
        <div class="timeline-time">${formatTime(event.time)}</div>
        <div class="timeline-dot"></div>
        <div><div class="timeline-name">${event.name}</div><div class="timeline-desc">${event.detail}</div></div>
      </div>`;
    }).join('');

    timelineSummaryEl.textContent = `${formatTime(departure)} → ${formatTime(events[events.length - 1].time)}`;
    arrivalTextEl.textContent = `目標 ${formatTime(arrival)} 抵達`;
    updateTrafficStamp();

    if (now < departure) {
      nextStepEl.textContent = `${formatTime(departure)} 出發`;
      nextDetailEl.textContent = `${formatTime(arrival)}抵達；${routeMinutes}分鐘車程＋${parkingBuffer}分鐘停車。`;
      statusLabelEl.textContent = '建議出發時間';
      countdownCaptionEl.textContent = '距離建議出發';
      countdownTextEl.textContent = minutesText(departure - now);
      progressFillEl.style.width = '0%';
    } else if (now < reachArea) {
      const lateMinutes = Math.max(0, Math.floor((now - departure) / 60000));
      nextStepEl.textContent = '現在出發';
      nextDetailEl.textContent = lateMinutes > 0
        ? `已比建議時間晚${lateMinutes}分鐘；請直接開Google Maps導航。`
        : '時間剛好，請直接開Google Maps導航。';
      statusLabelEl.textContent = '前往海癮咖啡';
      countdownCaptionEl.textContent = '導航原估車程';
      countdownTextEl.textContent = `${routeMinutes}分鐘`;
      progressFillEl.style.width = '20%';
    } else if (now < arrival) {
      nextStepEl.textContent = '先找基地旁停車';
      nextDetailEl.textContent = `預留${parkingBuffer}分鐘；滿位再找龍江街273巷合法車位。`;
      statusLabelEl.textContent = '抵達海邊周邊';
      countdownCaptionEl.textContent = '停車緩衝';
      countdownTextEl.textContent = minutesText(arrival - now);
      progressFillEl.style.width = '70%';
    } else if (currentIndex !== -1) {
      const upcoming = events[currentIndex];
      nextStepEl.textContent = upcoming.name;
      nextDetailEl.textContent = upcoming.detail;
      statusLabelEl.textContent = '到店後';
      countdownCaptionEl.textContent = `預計 ${formatTime(upcoming.time)}`;
      countdownTextEl.textContent = minutesText(upcoming.time - now);
      progressFillEl.style.width = '86%';
    } else {
      nextStepEl.textContent = '今天行程完成';
      nextDetailEl.textContent = '回程注意安全；下次可重新設定抵達時間。';
      statusLabelEl.textContent = '完成';
      countdownCaptionEl.textContent = '海癮行程';
      countdownTextEl.textContent = '完成';
      progressFillEl.style.width = '100%';
    }
  }

  function applyTrafficMinutes(value) {
    routeMinutesInput.value = clamp(value, 15, 90, 28);
    saveSettings(true);
    trafficSheetEl.classList.remove('show');
    update();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }

  loadSettings();
  const now = new Date();
  document.getElementById('todayLabel').textContent = `${now.getMonth() + 1}/${now.getDate()} 今天`;

  [arrivalInput, routeMinutesInput, parkingBufferInput].forEach(input => {
    input.addEventListener('change', () => {
      saveSettings(input === routeMinutesInput);
      update();
    });
  });

  document.getElementById('checkTraffic').addEventListener('click', () => {
    awaitingTrafficReturn = true;
    window.open(navLink.href, '_blank', 'noopener');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && awaitingTrafficReturn) {
      awaitingTrafficReturn = false;
      window.setTimeout(() => trafficSheetEl.classList.add('show'), 350);
    }
    if (!document.hidden && document.body.classList.contains('drive-mode')) requestWakeLock();
  });

  document.querySelectorAll('[data-minutes]').forEach(button => {
    button.addEventListener('click', () => applyTrafficMinutes(button.dataset.minutes));
  });
  document.getElementById('saveCustomMinutes').addEventListener('click', () => {
    applyTrafficMinutes(customMinutesInput.value);
    customMinutesInput.value = '';
  });
  document.getElementById('closeTrafficSheet').addEventListener('click', () => trafficSheetEl.classList.remove('show'));

  driveModeBtn.addEventListener('click', () => {
    const active = document.body.classList.toggle('drive-mode');
    driveModeBtn.textContent = active ? '✕ 完整攻略' : '🚙 開車模式';
    driveModeBtn.setAttribute('aria-label', active ? '離開開車模式' : '切換開車模式');
    if (active) requestWakeLock(); else releaseWakeLock();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const installCard = document.getElementById('installCard');
  const installButton = document.getElementById('installApp');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!isStandalone) installCard.classList.add('show');
  });
  if (isIOS && !isStandalone) installCard.classList.add('show');
  installButton.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installCard.classList.remove('show');
    } else if (isIOS) {
      window.alert('請點Safari下方「分享」按鈕，再選「加入主畫面」。');
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  update();
  window.setInterval(update, 30000);
})();
