const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const total = new Map();

app.get('/total', (req, res) => {
  const data = Array.from(total.values())
    .filter(link => link.status !== 'completed') 
    .map((link, index) => ({
        session: index + 1,
        url: link.url,
        count: link.count,
        id: link.id,
        target: link.target,
        status: link.status || 'running'
    }));
  res.json(JSON.parse(JSON.stringify(data || [], null, 2)));
});

app.get('/', (res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
    _timer: null,
    cookies,       
    accessToken,   
    interval,      
    sharedCount: 0
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
            job.count++;
            job.sharedCount++;
            total.set(postId, job);
        }

        if (job.sharedCount >= job.target) {
          job.status = 'completed';   
          clearInterval(job._timer);   
          total.set(postId, job);      
       }

    } catch (error) {
       clearInterval(job._timer);
       job.status = 'error';
       total.set(postId, job);
    }
}

  const timer = setInterval(sharePost, interval * 1000);

  const job = total.get(postId);
  job._timer = timer;
  total.set(postId, job);
}

app.post('/api/pause/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  clearInterval(job._timer);
  job.status = 'paused';
  total.set(req.params.id, job);

  res.json({ success: true });
});

app.post('/api/resume/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.status !== 'paused') return res.json({ success: false });

  job.status = 'running';

  const { cookies, accessToken, interval, target, sharedCount } = job;
  const id = job.id;

  async function sharePost() {
    const currentJob = total.get(req.params.id);
    if (!currentJob || currentJob.status !== 'running') return;

    try {
      const response = await axios.post(
        `https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`,
        {},
        { headers: {
          'accept': '*/*',
          'accept-encoding': 'gzip, deflate',
          'connection': 'keep-alive',
          'content-length': '0',
          'cookie': cookies,
          'host': 'graph.facebook.com'
        }}
      );

      if (response.status === 200) {
        currentJob.count++;
        currentJob.sharedCount++;
        total.set(req.params.id, currentJob);
      }

      if (currentJob.sharedCount >= currentJob.target) {
        currentJob.status = 'completed';
        clearInterval(currentJob._timer);
        total.set(req.params.id, currentJob); 
       }

    } catch (err) {
      clearInterval(currentJob._timer);
      currentJob.status = 'error';
      total.set(req.params.id, currentJob);
     }
  }

  job._timer = setInterval(sharePost, interval * 1000);
  total.set(req.params.id, job);

  res.json({ success: true });
});

app.post('/api/stop/:id', (req, res) => {
  const job = total.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  clearInterval(job._timer);
  total.delete(req.params.id);

  res.json({ success: true });
});

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

app.listen(5000, () => console.log('Server running on port 5000'));
