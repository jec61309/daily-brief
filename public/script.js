

fetch('daily.json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('date').innerText = data.date;

    const container = document.getElementById('stories');
    container.innerHTML = '';

    data.stories.forEach(story => {
      const card = document.createElement('article');
      card.className = 'story';

      card.innerHTML = `
        <div class="story-top">
          ${story.category ? `<span class="category">${story.category}</span>` : ''}
        </div>
        <h2>${story.title}</h2>
        <p><span class="label">What happened:</span> ${story.what}</p>
        <p><span class="label">Why it matters:</span> ${story.why}</p>
        <p><span class="label">Watch:</span> ${story.watch}</p>
        ${story.source ? `<div class="story-footer"><a href="${story.source}" target="_blank" rel="noopener noreferrer">Read source</a></div>` : ''}
      `;

      container.appendChild(card);
    });
  })
  .catch(err => {
    document.getElementById('stories').innerHTML = '<div class="empty-state">Could not load today\'s briefing.</div>';
    console.error(err);
  });