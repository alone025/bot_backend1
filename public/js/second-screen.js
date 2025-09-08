class SecondScreen {
      constructor() {
          this.conference = 'default';
          this.socket = null;
          this.init();
      }

      init() {
          this.connectSocket();
          this.loadInitialData();
          this.setupEventListeners();
      }

      connectSocket() {
          this.socket = io('http://localhost:3001');
          this.socket.on('connect', () => {
              console.log('Connected to server');
              this.socket.emit('join-conference', this.conference);
          });

          this.socket.on('pollUpdate', (poll) => this.updatePoll(poll));
          this.socket.on('newQuestion', (question) => this.addQuestion(question));
          this.socket.on('statsUpdate', (stats) => this.updateStats(stats));
      }

      setupEventListeners() {
          const conferenceSelect = document.getElementById('conferenceSelect');
          if (conferenceSelect) {
              conferenceSelect.addEventListener('change', (e) => {
                  this.conference = e.target.value;
                  this.socket.emit('join-conference', this.conference);
                  this.loadInitialData();
              });
          }

          // Tab switching
          document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                  tab.classList.add('active');
                  const tabName = tab.dataset.tab;

                  document.getElementById('pollsContainer').style.display = (tabName === 'polls') ? 'block' : 'none';
                  document.getElementById('questionsContainer').style.display = (tabName === 'questions') ? 'block' : 'none';
              });
          });

          setInterval(() => this.loadInitialData(), 30000);
      }

      async loadInitialData() {
          try {
              const [polls, questions, stats] = await Promise.all([
                  this.fetchData(`/api/second-screen/conference/${this.conference}/polls`),
                  this.fetchData(`/api/second-screen/conference/${this.conference}/questions`),
                  this.fetchData(`/api/second-screen/conference/${this.conference}/stats`)
              ]);
              this.updatePolls(polls);
              this.updateQuestions(questions);
              this.updateStats(stats);
          } catch (error) {
              console.error('Error loading initial data:', error);
          }
      }

      async fetchData(endpoint) {
          const response = await fetch(endpoint);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return await response.json();
      }

      updateStats(stats) {
          document.getElementById('participantsCount').textContent = stats.participants || 0;
          document.getElementById('connectionsCount').textContent = stats.connections || 0;
          document.getElementById('pollsCount').textContent = stats.activePolls || 0;
          document.getElementById('questionsCount').textContent = stats.unansweredQuestions || 0;
      }

      updatePolls(polls) {
          const container = document.getElementById('pollsContainer');
          if (!polls || polls.length === 0) {
              container.innerHTML = '<div class="empty-state">No active polls</div>';
              return;
          }
          container.innerHTML = polls.map(poll => `
              <div class="poll-card" data-poll-id="${poll._id}">
                  <div class="poll-question">${this.escapeHtml(poll.question)}</div>
                  <div class="poll-options">
                      ${poll.options.map((option, index) => `
                          <div class="poll-option">
                              <span class="option-text">${index + 1}. ${this.escapeHtml(option.text)}</span>
                              <span class="option-votes">${option.votes || 0}</span>
                          </div>
                      `).join('')}
                  </div>
              </div>
          `).join('');
      }

      updatePoll(poll) {
          const pollElement = document.querySelector(`[data-poll-id="${poll._id}"]`);
          if (pollElement) {
              pollElement.querySelectorAll('.poll-option').forEach((optionEl, index) => {
                  const votesEl = optionEl.querySelector('.option-votes');
                  if (votesEl && poll.options[index]) {
                      votesEl.textContent = poll.options[index].votes || 0;
                  }
              });
          } else {
              this.loadInitialData();
          }
      }

      updateQuestions(questions) {
          const container = document.getElementById('questionsContainer');
          if (!questions || questions.length === 0) {
              container.innerHTML = '<div class="empty-state">No questions yet</div>';
              return;
          }
          container.innerHTML = questions.map(question => `
              <div class="question-card">
                  <div class="question-text">${this.escapeHtml(question.question)}</div>
                  <div class="question-meta">
                      <span>For: ${this.escapeHtml(question.speaker)}</span>
                      <span>From: ${this.escapeHtml(question.askedByName || 'Anonymous')}</span>
                      <span>${new Date(question.createdAt).toLocaleTimeString()}</span>
                  </div>
              </div>
          `).join('');
      }

      addQuestion(question) {
          const container = document.getElementById('questionsContainer');
          if (container.querySelector('.empty-state')) container.innerHTML = '';

          const questionHtml = `
              <div class="question-card" style="animation: fadeIn 0.5s ease-in-out;">
                  <div class="question-text">${this.escapeHtml(question.question)}</div>
                  <div class="question-meta">
                      <span>For: ${this.escapeHtml(question.speaker)}</span>
                      <span>From: ${this.escapeHtml(question.askedBy)}</span>
                      <span>${new Date().toLocaleTimeString()}</span>
                  </div>
              </div>
          `;
          container.insertAdjacentHTML('afterbegin', questionHtml);
          const questionsCount = container.children.length;
          document.getElementById('questionsCount').textContent = questionsCount;
      }

      escapeHtml(text) {
          if (!text) return '';
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
      }
    }

    document.addEventListener('DOMContentLoaded', () => new SecondScreen());