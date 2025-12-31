const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const total = new Map();

/* =======================
   VIEW TOTAL STATUS
======================= */
app.get('/total', (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    url: link.url,
    count: link.count,
    id: link.id,
    target: link.target,
    status: link.status || 'running'
  }));
  res.json(JSON.parse(JSON.stringify(data || [], null, 2)));
});

/* =======================
   MAIN PAGE
======================= */
app.get('/', (res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* =======================
   SUBMIT SHARE JOB
======================= */
app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval } = req.body;

  if (!cookie || !url || !amount || !interval)
    return res.status(400).json({
      error: 'Missing state, url, amount, or interval'
    });

  try {
    const cookies = await convertCookie(cookie);
    if (!cookies) {
      return res.status(400).json({
        status: 500,
        error: 'Invalid cookies'
      });
    }

    await share(cookies, url, amount, interval);
    res.status(200).json({ status: 200 });

  } catch (err) {
    return res.status(500).json({
      status: 500,
      error: err.message || err
    });
  }
});

/* =======================
   SHARE LOGIC (UNCHANGED + EXTENDED)
======================= */
async function share(cookies, url, amount, interval) {
  const id = await getPostID(url);
  const accessToken = await getAccessToken(cookies);

  if (!id) {
    throw new Error("Unable to get link id: invalid URL, it's either a private post or visible to friends only");
  }

  const postId = total.has(id) ? id + 1 : id;

  total.set(postId, {
    url,
    id,
    count: 0,
    target: amount,
    status: 'running',
    _timer: null
  });

  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate',
    'connection': 'keep-alive',
    'content-length': '0',
    'cookie': cookies,
    'host': 'graph.facebook.com'
  };

  let sharedCount = 0;
  let timer;

  async function sharePost() {
    const job = total.get(postId);
    if (!job || job.status !== 'running') return;

    try {
      const response = await axios.post(
        `https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`,
        {},
        { headers }
      );

      if (response.status === 200) {
        total.set(postId, {
          ...job,
          count: job.count + 1
        });
        sharedCount++;
      }

      if (sharedCount === amount) {
        clearInterval(timer);
      }

    } catch (error) {
      clearInterval(timer);
      total.delete(postId);
    }
  }

  timer = setInterval(sharePost, interval * 1000);

  // SAVE TIMER COPY (ADD-ON ONLY)
  total.set(postId, {
    ...total.get(postId),
    _timer: timer
  });

  // ORIGINAL TIMEOUT (UNCHANGED)
  setTimeout(() => {
    clearInterval(timer);
    total.delete(postId);
  }, amount * interval * 1000);
}

/* =======================
   CONTROL ROUTES (ADD ONLY)
======================= */
app.post('/api/pause/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  clearInterval(job._timer);
  job.status = 'paused';

  res.json({ success: true });
});

app.post('/api/resume/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.status !== 'paused') return res.json({ success: false });

  job.status = 'running';
  job._timer = setInterval(() => {}, 1000);

  res.json({ success: true });
});

app.post('/api/stop/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  clearInterval(job._timer);
  total.delete(req.params.id);

  res.json({ success: true });
});

/* =======================
   HELPERS (UNCHANGED)
======================= */
async function getPostID(url) {
  try {
    const response = await axios.post(
      'https://id.traodoisub.com/api.php',
      `link=${encodeURIComponent(url)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.id;
  } catch {
    return;
  }
}

async function getAccessToken(cookie) {
  try {
    const headers = {
      'authority': 'business.facebook.com',
      'accept': 'text/html',
      'cookie': cookie,
      'referer': 'https://www.facebook.com/'
    };

    const response = await axios.get(
      'https://business.facebook.com/content_management',
      { headers }
    );

    const token = response.data.match(/"accessToken":\s*"([^"]+)"/);
    if (token && token[1]) return token[1];

  } catch {
    return;
  }
}

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = JSON.parse(cookie);
      const sbCookie = cookies.find(c => c.key === "sb");
      if (!sbCookie) reject("Invalid appstate");

      const data = `sb=${sbCookie.value}; ` +
        cookies.slice(1).map(c => `${c.key}=${c.value}`).join('; ');

      resolve(data);
    } catch {
      reject("Error processing appstate");
    }
  });
}

app.listen(5000);
