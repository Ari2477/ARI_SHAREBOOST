const fetchInterval = 2000;
let fetchTimeout;

async function fetchJobs() {
  try {
    const res = await fetch('/total');
    const jobs = await res.json();

    const container = document.getElementById('jobs');
    const processContainer = document.getElementById('processContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!jobs || jobs.length === 0) {
      if (processContainer) processContainer.style.display = 'none';
      scheduleNextFetch();
      return;
    }

    let hasActiveJob = false;

    jobs.forEach(job => {
      if (
        job.status === 'completed' ||
        job.status === 'stopped' ||
        job.status === 'error' ||
        job.count >= job.target
      ) {
        const existingEl = document.getElementById(`job-${job.id}`);
        if (existingEl) existingEl.remove(); 
        return;
      }

      hasActiveJob = true;

      const div = document.createElement('div');
      div.id = `job-${job.id}`;
      div.style.border = '1px solid rgba(255,255,255,0.08)';
      div.style.padding = '10px';
      div.style.margin = '6px 0';
      div.style.borderRadius = '8px';

      let buttons = '';
      if (job.status === 'running') {
        buttons = `
          <div class="job-buttons">
            <button onclick="pauseJob('${job.id}')" title="Pause">
              <i class="fa-solid fa-pause"></i>
            </button>
            <button onclick="stopJob('${job.id}')" title="Stop">
              <i class="fa-solid fa-stop"></i>
            </button>
          </div>
        `;
      } else if (job.status === 'paused') {
        buttons = `
          <div class="job-buttons">
            <button onclick="resumeJob('${job.id}')" title="Resume">
              <i class="fa-solid fa-play"></i>
            </button>
            <button onclick="stopJob('${job.id}')" title="Stop">
              <i class="fa-solid fa-stop"></i>
            </button>
          </div>
        `;
      }

      div.innerHTML = `
        <div class="job-box ${job.status}">
          <div class="job-url-container">
            <strong>URL:</strong> <span class="job-url" title="${job.url}">${job.url}</span>
          </div>
          <div class="job-count">
            <strong>Count:</strong> <span>${job.count}/${job.target}</span>
          </div>
          <div class="job-status">
            <strong>Status:</strong> <span>${job.status}</span>
          </div>
          ${buttons}
        </div>
      `;

      container.appendChild(div);
    });

    if (processContainer) {
      processContainer.style.display = hasActiveJob ? 'block' : 'none';
    }

  } catch (err) {
    console.error('Error fetching jobs:', err);
    const processContainer = document.getElementById('processContainer');
    if (processContainer) processContainer.style.display = 'none';
  }

  scheduleNextFetch();
}

function scheduleNextFetch() {
  fetchTimeout = setTimeout(fetchJobs, fetchInterval);
}

async function pauseJob(id) {
  try {
    await fetch(`/api/pause/${id}`, { method: 'POST' });
    fetchJobs();
  } catch (err) {
    console.error(err);
    const el = document.getElementById(`job-${id}`);
    if (el) el.remove(); 
  }
}

async function resumeJob(id) {
  try {
    await fetch(`/api/resume/${id}`, { method: 'POST' });
    fetchJobs();
  } catch (err) {
    console.error(err);
    const el = document.getElementById(`job-${id}`);
    if (el) el.remove(); 
  }
}

async function stopJob(id) {
  try {
    await fetch(`/api/stop/${id}`, { method: 'POST' });
    const el = document.getElementById(`job-${id}`);
    if (el) el.remove();
    fetchJobs();
  } catch (err) {
    console.error(err);
    const el = document.getElementById(`job-${id}`);
    if (el) el.remove();
  }
}

fetchJobs();
