// Основные переменные
let currentMovieData = null;
const KINOPOISK_API_KEY = '849350bf-5964-42f2-b33d-e59ab7f739f2';
const KINOPOISK_SEARCH_URL = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
const KINOPOISK_MOVIE_URL = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/';
const API_BASE_URL = '/api/movies';

// Глобальная переменная для хранения фильмов
let allMovies = [];

// Определяем тип версии
const isAdminVersion = document.body.classList.contains('admin-version');
const isPublicVersion = !isAdminVersion;

// Элементы DOM
const addMovieBtn = document.getElementById('addMovieBtn');
const modal = document.getElementById('addMovieModal');
const closeBtn = document.querySelector('.close');
const movieSearch = document.getElementById('movieSearch');
const searchResults = document.getElementById('searchResults');
const ratingSection = document.getElementById('ratingSection');
const saveMovieBtn = document.getElementById('saveMovie');
const statsBtn = document.getElementById('statsBtn');
const statsModal = document.getElementById('statsModal');
const closeStatsBtn = document.getElementById('closeStats');
const movieDetailModal = document.getElementById('movieDetailModal');
const closeMovieDetailBtn = document.getElementById('closeMovieDetail');
const movieDetailContent = document.getElementById('movieDetailContent');

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница загружена');

    // В публичной версии скрываем кнопку добавления фильма
    if (isPublicVersion && addMovieBtn) {
        addMovieBtn.style.display = 'none';
    }

    setupSliders();
    calculateAllRatings();
    loadMovies();
    setupEventListeners();
});

// Настройка обработчиков событий
function setupEventListeners() {
    console.log('Настройка обработчиков...');

    if (isAdminVersion && addMovieBtn) {
        addMovieBtn.addEventListener('click', function() {
            console.log('Кнопка добавления нажата');
            modal.style.display = 'block';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            console.log('Закрытие модального окна');
            modal.style.display = 'none';
            resetForm();
        });
    }

    if (closeStatsBtn) {
        closeStatsBtn.addEventListener('click', function() {
            statsModal.style.display = 'none';
        });
    }

    if (closeMovieDetailBtn) {
        closeMovieDetailBtn.addEventListener('click', function() {
            movieDetailModal.style.display = 'none';
        });
    }

    if (saveMovieBtn) {
        saveMovieBtn.addEventListener('click', function() {
            console.log('Кнопка сохранения нажата');
            saveMovie();
        });
    }

    if (statsBtn) {
        statsBtn.addEventListener('click', function() {
            console.log('Кнопка статистики нажата');
            showStats();
        });
    }

    if (isAdminVersion && movieSearch) {
        movieSearch.addEventListener('input', debounce(handleMovieSearch, 500));
    }

    // Закрытие модальных окон по клику вне области
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
            resetForm();
        }
        if (e.target === statsModal) {
            statsModal.style.display = 'none';
        }
        if (e.target === movieDetailModal) {
            movieDetailModal.style.display = 'none';
        }
    });

    console.log('Обработчики настроены');
}

// ========== СИСТЕМА ХРАНЕНИЯ (Supabase) ==========

async function loadMovies() {
    try {
        console.log('🔄 Загрузка фильмов из Supabase...');
        const response = await fetch(API_BASE_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const movies = await response.json();
        console.log(`✅ Загружено ${movies.length} фильмов из Supabase`);

        // Сохраняем фильмы в глобальную переменную
        allMovies = movies;

        const moviesGrid = document.getElementById('moviesGrid');
        moviesGrid.innerHTML = '';

        if (movies.length === 0) {
            moviesGrid.innerHTML = '<p style="text-align: center; color: #ccc; grid-column: 1 / -1;">Фильмов пока нет</p>';
            return;
        }

        const sortedMovies = movies.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
        sortedMovies.forEach(movie => addMovieCard(movie));
        updateAllMoviePositions();
    } catch (error) {
        console.error('❌ Ошибка загрузки фильмов:', error);
        const moviesGrid = document.getElementById('moviesGrid');
        moviesGrid.innerHTML = '<p style="text-align: center; color: #ccc; grid-column: 1 / -1;">Ошибка загрузки фильмов</p>';
    }
}

async function saveMovie() {
    if (!currentMovieData) {
        alert('Сначала выберите фильм!');
        return;
    }

    const userRatings = getRatingsFromSliders('.blue-slider');
    const girlfriendRatings = getRatingsFromSliders('.purple-slider');

    const movieCard = {
        id: Date.now(),
        movie: currentMovieData,
        userRatings,
        girlfriendRatings,
        userTotal: Math.round(calculateUserRating('.blue-slider')),
        girlfriendTotal: Math.round(calculateUserRating('.purple-slider')),
        finalRating: Math.round((calculateUserRating('.blue-slider') + calculateUserRating('.purple-slider')) / 2),
        dateAdded: new Date().toISOString(),
        userNotes: '',
        girlfriendNotes: '',
        hasSpoilers: false
    };

    try {
        console.log('💾 Сохранение фильма в Supabase...');
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(movieCard)
        });

        const result = await response.json();
        console.log('📨 Ответ сервера:', result);

        if (response.ok && result.success) {
            console.log('✅ Фильм успешно сохранен в Supabase');
            // Перезагружаем все фильмы
            await loadMovies();
            modal.style.display = 'none';
            resetForm();
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        alert('Ошибка сохранения фильма: ' + error.message);
    }
}

async function deleteMovie(movieId) {
    if (confirm('Точно удалить этот фильм из списка?')) {
        try {
            console.log('🗑️ Удаление фильма:', movieId);
            const response = await fetch(API_BASE_URL, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ movieId })
            });

            const result = await response.json();
            console.log('📨 Ответ сервера:', result);

            if (response.ok && result.success) {
                movieDetailModal.style.display = 'none';
                await loadMovies(); // Перезагружаем список
                alert('Фильм удален!');
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('❌ Ошибка удаления:', error);
            alert('Ошибка удаления фильма: ' + error.message);
        }
    }
}

// ========== ОТОБРАЖЕНИЕ КАРТОЧЕК ==========

function addMovieCard(movieCard) {
    const moviesGrid = document.getElementById('moviesGrid');
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('data-movie-id', movieCard.id);

    const posterUrl = movieCard.movie.posterUrl || movieCard.movie.posterUrlPreview || 'https://via.placeholder.com/300x450/333/fff?text=No+Poster';
    const movieTitle = movieCard.movie.nameRu || movieCard.movie.nameEn || 'Название не указано';
    const movieYear = movieCard.movie.year || '';

    // Получаем место в топе (теперь из allMovies)
    const topPosition = getMovieTopPosition(movieCard.id);
    const isTop5 = topPosition <= 5;
    const isTop10 = topPosition <= 10 && topPosition > 5;

    card.innerHTML = `
        <div class="poster-container">
            <img src="${posterUrl}" alt="${movieTitle}" class="poster">
            <div class="ratings-overlay">
                <div class="rating-circle blue">${movieCard.userTotal}</div>
                <div class="rating-circle white">${movieCard.finalRating}</div>
                <div class="rating-circle purple">${movieCard.girlfriendTotal}</div>
            </div>
            ${isTop5 ? `<div class="top-badge gold-badge">🏆 Топ-${topPosition}</div>` : ''}
            ${isTop10 ? `<div class="top-badge silver-badge">🥈 Топ-${topPosition}</div>` : ''}
        </div>
        <div class="movie-info">
            <div class="movie-header">
                <h3>${movieTitle}</h3>
                ${topPosition ? `
                    <div class="rank-badge ${isTop5 ? 'gold-rank' : isTop10 ? 'silver-rank' : 'regular-rank'}">
                        ${isTop5 ? '🏆' : isTop10 ? '🥈' : '#'}${topPosition}
                    </div>
                ` : ''}
            </div>
            <p class="movie-year">${movieYear} • ${new Date(movieCard.dateAdded).toLocaleDateString('ru-RU')}</p>
            <div class="criteria-scores">
                <span>Эмоции: ${calculateAverageCriteria(movieCard, 0)}</span>
                <span>Сюжет: ${calculateAverageCriteria(movieCard, 1)}</span>
                <span>Идея: ${calculateAverageCriteria(movieCard, 2)}</span>
                <span>Стиль: ${calculateAverageCriteria(movieCard, 3)}</span>
                <span>Послевкусие: ${calculateAverageCriteria(movieCard, 4)}</span>
            </div>
        </div>
    `;

    card.style.cursor = 'pointer';
    card.addEventListener('click', function() {
        console.log('Клик по карточке фильма:', movieCard.id);
        openMovieDetail(movieCard.id);
    });

    moviesGrid.insertBefore(card, moviesGrid.firstChild);
}

// Получение позиции фильма в топе (теперь из allMovies)
function getMovieTopPosition(movieId) {
    if (allMovies.length === 0) return null;

    // Сортируем фильмы по рейтингу (от высшего к низшему)
    const sortedMovies = [...allMovies].sort((a, b) => b.finalRating - a.finalRating);

    // Находим индекс фильма (начинается с 0, поэтому +1)
    const position = sortedMovies.findIndex(movie => movie.id == movieId) + 1;
    return position > 0 ? position : null;
}

function calculateAverageCriteria(movieCard, criterionIndex) {
    const userRating = movieCard.userRatings[criterionIndex];
    const girlfriendRating = movieCard.girlfriendRatings[criterionIndex];
    return ((userRating + girlfriendRating) / 2).toFixed(1);
}

// ========== ДЕТАЛЬНАЯ КАРТОЧКА ФИЛЬМА ==========

function openMovieDetail(movieId) {
    console.log('Открытие деталей фильма:', movieId);

    // Ищем фильм в allMovies вместо localStorage
    const movie = allMovies.find(m => m.id == movieId);

    if (!movie) {
        alert('Фильм не найден!');
        return;
    }

    movieDetailContent.innerHTML = createMovieDetailHTML(movie);
    movieDetailModal.style.display = 'block';
    setupSpoilerHandlers();

    if (isAdminVersion) {
        setupEditHandlers(movie);
    }
}

function createMovieDetailHTML(movie) {
    const posterUrl = movie.movie.posterUrl || movie.movie.posterUrlPreview || 'https://via.placeholder.com/300x450/333/fff?text=No+Poster';
    const movieTitle = movie.movie.nameRu || movie.movie.nameEn || 'Название не указано';
    const movieYear = movie.movie.year || '';
    const kpRating = movie.movie.ratingKinopoisk ? ` • КП: ${movie.movie.ratingKinopoisk}` : '';

    // Получаем место в топе из allMovies
    const topPosition = getMovieTopPosition(movie.id);
    const isTop5 = topPosition <= 5;
    const isTop10 = topPosition <= 10 && topPosition > 5;

    // Проверяем, есть ли заметки
    const userNotes = movie.userNotes || '';
    const girlfriendNotes = movie.girlfriendNotes || '';
    const hasSpoilers = movie.hasSpoilers || false;

    // Определяем, показывать ли спойлер-секцию
    const showSpoilerSection = hasSpoilers || userNotes.toLowerCase().includes('спойлер') || girlfriendNotes.toLowerCase().includes('спойлер');

    return `
        <div class="movie-detail-header">
            <img src="${posterUrl}" alt="${movieTitle}" class="movie-detail-poster">
            <div class="movie-detail-info">
                <div class="movie-detail-title-section">
                    <h1 class="movie-detail-title ${isTop5 ? 'top-movie-detail-title' : isTop10 ? 'silver-movie-detail-title' : ''}">${movieTitle}</h1>
                    ${topPosition ? `
                        <div class="top-position-badge ${isTop5 ? 'gold-position-badge' : isTop10 ? 'silver-position-badge' : 'regular-position-badge'}">
                            ${isTop5 ? '🏆' : isTop10 ? '🥈' : '📊'} Место ${topPosition}
                        </div>
                    ` : ''}
                </div>
                <div class="movie-detail-meta">
                    <span class="movie-year-large">${movieYear}${kpRating}</span><br>
                    <span class="date-added">Добавлен: ${new Date(movie.dateAdded).toLocaleDateString('ru-RU')}</span>
                </div>

                ${isAdminVersion ? `
                <div class="movie-detail-actions">
                    <button class="movie-detail-btn edit" onclick="enableEditMode(${movie.id})">✏️ Редактировать заметки</button>
                    <button class="movie-detail-btn delete" onclick="deleteMovie(${movie.id})">🗑️ Удалить фильм</button>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="ratings-comparison">
            <h3>🎯 Ваши оценки</h3>
            <div class="ratings-grid">
                <div class="user-ratings-column">
                    <div class="user-ratings-header blue">
                        <h4>Твои оценки (elevely)</h4>
                    </div>
                    ${createCriteriaDetailHTML(movie.userRatings, 'blue')}
                    <div class="user-total-detail blue-text">
                        ИТОГ: ${movie.userTotal}/100
                    </div>
                </div>

                <div class="average-column">
                    <h4>Среднее</h4>
                    ${createAverageCriteriaHTML(movie)}
                    <div class="user-total-detail" style="color: #fff; margin-top: 15px;">
                        ОБЩИЙ: ${movie.finalRating}/100
                    </div>
                </div>

                <div class="user-ratings-column">
                    <div class="user-ratings-header purple">
                        <h4>Машкины оценки</h4>
                    </div>
                    ${createCriteriaDetailHTML(movie.girlfriendRatings, 'purple')}
                    <div class="user-total-detail purple-text">
                        ИТОГ: ${movie.girlfriendTotal}/100
                    </div>
                </div>
            </div>
        </div>

        <div class="notes-section">
            <h3>💬 Ваши заметки</h3>

            ${!showSpoilerSection ? `
                <div class="user-notes">
                    <h4 class="blue-text">Твои впечатления</h4>
                    <div class="notes-text ${!userNotes ? 'empty' : ''}" id="userNotesDisplay">
                        ${userNotes || 'Заметок пока нет...'}
                    </div>
                    ${isAdminVersion ? `
                    <textarea class="editable-notes" id="userNotesEdit" style="display: none;" placeholder="Напиши свои впечатления о фильме...">${userNotes || ''}</textarea>
                    ` : ''}
                </div>

                <div class="user-notes">
                    <h4 class="purple-text">Машкины впечатления</h4>
                    <div class="notes-text ${!girlfriendNotes ? 'empty' : ''}" id="girlfriendNotesDisplay">
                        ${girlfriendNotes || 'Заметок пока нет...'}
                    </div>
                    ${isAdminVersion ? `
                    <textarea class="editable-notes" id="girlfriendNotesEdit" style="display: none;" placeholder="Напиши Машкины впечатления о фильме...">${girlfriendNotes || ''}</textarea>
                    ` : ''}
                </div>
            ` : `
                <div class="spoiler-section">
                    <button class="spoiler-toggle" onclick="toggleSpoilers()">
                        ⚠️ Показать спойлеры
                    </button>
                    <div class="spoiler-content" id="spoilerContent" style="display: none;">
                        <div class="spoiler-warning">
                            ⚠️ ВНИМАНИЕ: СПОЙЛЕРЫ!
                        </div>
                        <div class="user-notes">
                            <h4 class="blue-text">Твои заметки</h4>
                            <div class="notes-text">
                                ${userNotes || 'Нет заметок со спойлерами'}
                            </div>
                        </div>
                        <div class="user-notes">
                            <h4 class="purple-text">Машкины заметки</h4>
                            <div class="notes-text">
                                ${girlfriendNotes || 'Нет заметок со спойлерами'}
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>

        ${isAdminVersion ? `
        <div class="movie-detail-actions" id="editActions" style="display: none; justify-content: center;">
            <button class="movie-detail-btn edit" onclick="saveMovieEdits(${movie.id})">💾 Сохранить изменения</button>
            <button class="movie-detail-btn" onclick="cancelEditMode()" style="background: #6b7280;">❌ Отмена</button>
        </div>
        ` : ''}
    `;
}

// ... остальные функции остаются такими же, но нужно обновить saveMovieEdits:

async function saveMovieEdits(movieId) {
    const userNotes = document.getElementById('userNotesEdit').value;
    const girlfriendNotes = document.getElementById('girlfriendNotesEdit').value;

    try {
        // Обновляем фильм в Supabase
        const response = await fetch(API_BASE_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                movieId: movieId,
                userNotes: userNotes,
                girlfriendNotes: girlfriendNotes,
                hasSpoilers: userNotes.toLowerCase().includes('спойлер') || girlfriendNotes.toLowerCase().includes('спойлер')
            })
        });

        if (response.ok) {
            // Обновляем локальные данные
            const movieIndex = allMovies.findIndex(m => m.id == movieId);
            if (movieIndex !== -1) {
                allMovies[movieIndex].userNotes = userNotes;
                allMovies[movieIndex].girlfriendNotes = girlfriendNotes;
                allMovies[movieIndex].hasSpoilers = userNotes.toLowerCase().includes('спойлер') || girlfriendNotes.toLowerCase().includes('спойлер');
            }

            // Обновляем отображение
            openMovieDetail(movieId);
            alert('Изменения сохранены!');
        } else {
            throw new Error('Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка сохранения заметок:', error);
        alert('Ошибка сохранения заметок');
    }
}

// ========== СТАТИСТИКА ==========

function showStats() {
    console.log('Показ статистики');

    if (allMovies.length === 0) {
        statsModal.style.display = 'block';
        document.getElementById('statsContent').innerHTML = '<p>Пока нет данных для статистики. Добавьте несколько фильмов!</p>';
        return;
    }

    const stats = calculateStatistics(allMovies); // Теперь используем allMovies
    displayStatistics(stats);
    statsModal.style.display = 'block';
}

function calculateStatistics(movies) {
    // ... эта функция остается такой же, но теперь работает с allMovies
    let userTotal = 0;
    let girlfriendTotal = 0;
    let userCriteriaSums = [0, 0, 0, 0, 0];
    let girlfriendCriteriaSums = [0, 0, 0, 0, 0];
    let highestRated = null;
    let lowestRated = null;
    let biggestDifference = null;

    movies.forEach(movie => {
        userTotal += movie.userTotal;
        girlfriendTotal += movie.girlfriendTotal;

        // Суммы по критериям
        movie.userRatings.forEach((rating, index) => {
            userCriteriaSums[index] += rating;
        });
        movie.girlfriendRatings.forEach((rating, index) => {
            girlfriendCriteriaSums[index] += rating;
        });

        // Самый высокооцененный фильм
        if (!highestRated || movie.finalRating > highestRated.finalRating) {
            highestRated = movie;
        }

        // Самый низкооцененный фильм
        if (!lowestRated || movie.finalRating < lowestRated.finalRating) {
            lowestRated = movie;
        }

        // Самый спорный фильм (наибольшая разница в оценках)
        const difference = Math.abs(movie.userTotal - movie.girlfriendTotal);
        if (!biggestDifference || difference > biggestDifference.difference) {
            biggestDifference = {
                movie: movie,
                difference: difference
            };
        }
    });

    return {
        totalMovies: movies.length,
        averageUserRating: userTotal / movies.length,
        averageGirlfriendRating: girlfriendTotal / movies.length,
        userCriteriaAverages: userCriteriaSums.map(sum => sum / movies.length),
        girlfriendCriteriaAverages: girlfriendCriteriaSums.map(sum => sum / movies.length),
        highestRated,
        lowestRated,
        biggestDifference
    };
}

function displayStatistics(stats) {
    const criteriaNames = ['Эмоции', 'Сюжет', 'Идея', 'Стиль', 'Послевкусие'];

    document.getElementById('statsContent').innerHTML = `
        <div class="stat-card">
            <h3>📈 Общая статистика</h3>
            <div class="stat-value white">${stats.totalMovies}</div>
            <p>всего фильмов оценено</p>

            <div style="margin-top: 20px;">
                <div class="comparison-bar">
                    <div class="bar-segment blue" style="width: ${(stats.averageUserRating / 100) * 100}%">
                        ${Math.round(stats.averageUserRating)}
                    </div>
                    <div class="bar-segment purple" style="width: ${(stats.averageGirlfriendRating / 100) * 100}%">
                        ${Math.round(stats.averageGirlfriendRating)}
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 10px; font-weight: 600;">
                    <span class="blue-text">elevely</span>
                    <span class="purple-text">Машка</span>
                </div>
            </div>
        </div>

        <div class="stat-card">
            <h3>⭐ Лучший фильм</h3>
            <div class="movie-title-card">
                <h4>${stats.highestRated.movie.nameRu || stats.highestRated.movie.nameEn}</h4>
                <div class="rating-circles-container">
                    <div class="rating-circle-small blue">
                        <div class="rating-value">${stats.highestRated.userTotal}</div>
                        <div class="rating-label">elevely</div>
                    </div>
                    <div class="rating-circle-small white">
                        <div class="rating-value">${stats.highestRated.finalRating}</div>
                        <div class="rating-label">Общий</div>
                    </div>
                    <div class="rating-circle-small purple">
                        <div class="rating-value">${stats.highestRated.girlfriendTotal}</div>
                        <div class="rating-label">Машка</div>
                    </div>
                </div>
            </div>
            <p style="text-align: center; color: #ccc; font-size: 0.9em;">Высший балл: ${stats.highestRated.finalRating}/100</p>
        </div>

        <div class="stat-card">
            <h3>💔 Худший фильм</h3>
            <div class="movie-title-card">
                <h4>${stats.lowestRated.movie.nameRu || stats.lowestRated.movie.nameEn}</h4>
                <div class="rating-circles-container">
                    <div class="rating-circle-small blue">
                        <div class="rating-value">${stats.lowestRated.userTotal}</div>
                        <div class="rating-label">elevely</div>
                    </div>
                    <div class="rating-circle-small white">
                        <div class="rating-value">${stats.lowestRated.finalRating}</div>
                        <div class="rating-label">Общий</div>
                    </div>
                    <div class="rating-circle-small purple">
                        <div class="rating-value">${stats.lowestRated.girlfriendTotal}</div>
                        <div class="rating-label">Машка</div>
                    </div>
                </div>
            </div>
            <p style="text-align: center; color: #ccc; font-size: 0.9em;">Низший балл: ${stats.lowestRated.finalRating}/100</p>
        </div>

        <div class="stat-card">
            <h3>🔥 Самый спорный</h3>
            <div class="movie-title-card">
                <h4>${stats.biggestDifference.movie.movie.nameRu || stats.biggestDifference.movie.movie.nameEn}</h4>
                <div class="rating-circles-container">
                    <div class="rating-circle-small blue">
                        <div class="rating-value">${stats.biggestDifference.movie.userTotal}</div>
                        <div class="rating-label">elevely</div>
                    </div>
                    <div class="rating-circle-small white">
                        <div class="rating-value">${stats.biggestDifference.difference}</div>
                        <div class="rating-label">Разница</div>
                    </div>
                    <div class="rating-circle-small purple">
                        <div class="rating-value">${stats.biggestDifference.movie.girlfriendTotal}</div>
                        <div class="rating-label">Машка</div>
                    </div>
                </div>
            </div>
            <p style="text-align: center; color: #ccc; font-size: 0.9em;">Разница в оценках: ${stats.biggestDifference.difference}pt</p>
        </div>

        <div class="stat-card">
            <h3>🎯 Средние оценки по критериям</h3>
            <div class="movie-list">
                ${criteriaNames.map((name, index) => `
                    <div class="movie-stat-item">
                        <span class="movie-stat-name">${name}</span>
                        <div class="movie-stat-rating">
                            <span class="rating-pill blue">${stats.userCriteriaAverages[index].toFixed(1)}</span>
                            <span class="rating-pill purple">${stats.girlfriendCriteriaAverages[index].toFixed(1)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="stat-card">
            <h3>🏆 Топ-5 фильмов</h3>
            <div class="top-movies-list">
                ${getTopMovies().map((movie, index) => {
                    const movieTitle = movie.movie.nameRu || movie.movie.nameEn;
                    const shortTitle = movieTitle.length > 30 ? movieTitle.substring(0, 30) + '...' : movieTitle;

                    return `
                        <div class="top-movie-item">
                            <div class="top-movie-rank">${index + 1}</div>
                            <div class="top-movie-info">
                                <div class="top-movie-title" title="${movieTitle}">${shortTitle}</div>
                            </div>
                            <div class="top-movie-ratings">
                                <div class="rating-mini-circle blue" title="elevely: ${movie.userTotal}">
                                    <div class="mini-rating-value">${movie.userTotal}</div>
                                    <div class="mini-rating-label">E</div>
                                </div>
                                <div class="rating-mini-circle white" title="Общий: ${movie.finalRating}">
                                    <div class="mini-rating-value">${movie.finalRating}</div>
                                    <div class="mini-rating-label">О</div>
                                </div>
                                <div class="rating-mini-circle purple" title="Машка: ${movie.girlfriendTotal}">
                                    <div class="mini-rating-value">${movie.girlfriendTotal}</div>
                                    <div class="mini-rating-label">М</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function getTopMovies() {
    const movies = JSON.parse(localStorage.getItem('movies')) || [];
    return movies
        .sort((a, b) => b.finalRating - a.finalRating)
        .slice(0, 5)
        .map((movie, index) => ({
            ...movie,
            rank: index + 1
        }));
}

// ========== УДАЛЕНИЕ ФИЛЬМА ==========

function deleteMovie(movieId) {
    console.log('Удаление фильма:', movieId);
    if (confirm('Точно удалить этот фильм из списка?')) {
        const movies = JSON.parse(localStorage.getItem('movies')) || [];
        const updatedMovies = movies.filter(m => m.id !== movieId);
        localStorage.setItem('movies', JSON.stringify(updatedMovies));
        
        // Закрываем модальное окно
        movieDetailModal.style.display = 'none';
        
        // Перезагружаем список фильмов
        loadMovies();
        
        alert('Фильм удален!');
    }
}

// ========== ОБНОВЛЕНИЕ ПОЗИЦИЙ ==========

function updateAllMoviePositions() {
    console.log('Обновление позиций фильмов');
    
    const moviesGrid = document.getElementById('moviesGrid');
    const movieCards = moviesGrid.querySelectorAll('.movie-card');

    // Получаем все фильмы из allMovies и сортируем их по рейтингу
    const sortedMovies = [...allMovies].sort((a, b) => b.finalRating - a.finalRating);

    movieCards.forEach(card => {
        const movieId = parseInt(card.getAttribute('data-movie-id'));
        const position = sortedMovies.findIndex(movie => movie.id === movieId) + 1;

        if (position > 0) {
            const isTop5 = position <= 5;
            const isTop10 = position <= 10 && position > 5;

            // Находим или создаем бейдж места
            let rankBadge = card.querySelector('.rank-badge');
            if (!rankBadge) {
                rankBadge = document.createElement('div');
                rankBadge.className = 'rank-badge';
                card.querySelector('.movie-header').appendChild(rankBadge);
            }

            // Обновляем бейдж места
            rankBadge.className = `rank-badge ${isTop5 ? 'gold-rank' : isTop10 ? 'silver-rank' : 'regular-rank'}`;
            rankBadge.innerHTML = `${isTop5 ? '🏆' : isTop10 ? '🥈' : '#'}${position}`;

            // Обновляем бейдж на постере
            const posterContainer = card.querySelector('.poster-container');
            let goldBadge = posterContainer.querySelector('.gold-badge');
            let silverBadge = posterContainer.querySelector('.silver-badge');

            // Удаляем старые бейджи
            if (goldBadge) goldBadge.remove();
            if (silverBadge) silverBadge.remove();

            // Добавляем новый бейдж если в топ-10
            if (isTop5) {
                const newBadge = document.createElement('div');
                newBadge.className = 'top-badge gold-badge';
                newBadge.textContent = `🏆 Топ-${position}`;
                posterContainer.appendChild(newBadge);
            } else if (isTop10) {
                const newBadge = document.createElement('div');
                newBadge.className = 'top-badge silver-badge';
                newBadge.textContent = `🥈 Топ-${position}`;
                posterContainer.appendChild(newBadge);
            }
        }
    });
}

// ========== ПОИСК ФИЛЬМОВ ==========

async function handleMovieSearch(e) {
    const query = e.target.value.trim();
    console.log('Поиск:', query);

    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        searchResults.innerHTML = '<div class="search-result-item">Поиск...</div>';

        const response = await fetch(`${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`, {
            method: 'GET',
            headers: {
                'X-API-KEY': KINOPOISK_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.films && data.films.length > 0) {
            displaySearchResults(data.films);
        } else {
            searchResults.innerHTML = '<div class="search-result-item">Фильмы не найдены</div>';
        }
    } catch (error) {
        console.error('Ошибка поиска:', error);
        searchResults.innerHTML = '<div class="search-result-item">Ошибка поиска</div>';
    }
}

function displaySearchResults(results) {
    searchResults.innerHTML = '';
    console.log('Найдено фильмов:', results.length);

    results.forEach(movie => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.style.cursor = 'pointer';

        const genres = movie.genres ? movie.genres.map(genre => genre.genre).join(', ') : '';

        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                ${movie.posterUrlPreview ? `<img src="${movie.posterUrlPreview}" alt="${movie.nameRu}" style="width: 40px; height: 60px; object-fit: cover; border-radius: 4px;">` : ''}
                <div>
                    <strong>${movie.nameRu || movie.nameEn}</strong><br>
                    <small>${movie.year} • ${genres}</small>
                </div>
            </div>
        `;

        div.addEventListener('click', async function() {
            console.log('Выбран фильм:', movie.nameRu || movie.nameEn);
            try {
                const response = await fetch(`${KINOPOISK_MOVIE_URL}${movie.filmId}`, {
                    method: 'GET',
                    headers: {
                        'X-API-KEY': KINOPOISK_API_KEY,
                        'Content-Type': 'application/json',
                    },
                });
                const fullMovieData = await response.json();
                selectMovie(fullMovieData);
            } catch (error) {
                console.error('Ошибка загрузки деталей фильма:', error);
                selectMovie(movie);
            }
        });

        searchResults.appendChild(div);
    });
}

function selectMovie(movie) {
    console.log('Фильм выбран:', movie.nameRu || movie.nameEn);
    currentMovieData = movie;

    const posterUrl = movie.posterUrl || movie.posterUrlPreview || 'https://via.placeholder.com/300x450/333/fff?text=No+Poster';

    document.getElementById('selectedPoster').src = posterUrl;
    document.getElementById('selectedTitle').textContent = movie.nameRu || movie.nameEn || 'Название не указано';

    const yearText = movie.year ? `(${movie.year})` : '';
    const ratingText = movie.ratingKinopoisk ? ` • Рейтинг КП: ${movie.ratingKinopoisk}` : '';
    document.getElementById('selectedYear').textContent = yearText + ratingText;

    ratingSection.style.display = 'block';
    searchResults.innerHTML = '';
    movieSearch.value = '';

    calculateAllRatings();
}

// ========== СИСТЕМА ОЦЕНОК ==========

function setupSliders() {
    console.log('Настройка слайдеров...');
    
    document.querySelectorAll('.blue-slider').forEach(slider => {
        const valueDisplay = slider.nextElementSibling;
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            calculateAllRatings();
        });
    });

    document.querySelectorAll('.purple-slider').forEach(slider => {
        const valueDisplay = slider.nextElementSibling;
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            calculateAllRatings();
        });
    });
}

function calculateAllRatings() {
    const userTotal = calculateUserRating('.blue-slider');
    const girlfriendTotal = calculateUserRating('.purple-slider');
    const finalRating = (userTotal + girlfriendTotal) / 2;

    document.getElementById('userTotal').textContent = Math.round(userTotal);
    document.getElementById('girlfriendTotal').textContent = Math.round(girlfriendTotal);
    document.getElementById('finalRating').textContent = Math.round(finalRating);
}

function calculateUserRating(sliderSelector) {
    const sliders = document.querySelectorAll(sliderSelector);
    const weights = [1, 1, 1, 1, 1.5];
    let weightedSum = 0;

    sliders.forEach((slider, index) => {
        const value = parseFloat(slider.value);
        weightedSum += value * weights[index];
    });

    const tenPointRating = weightedSum / 5.5;
    return tenPointRating * 10;
}

function getRatingsFromSliders(sliderSelector) {
    return Array.from(document.querySelectorAll(sliderSelector)).map(slider => parseFloat(slider.value));
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function resetForm() {
    console.log('Сброс формы');
    currentMovieData = null;
    if (ratingSection) ratingSection.style.display = 'none';
    if (movieSearch) movieSearch.value = '';
    if (searchResults) searchResults.innerHTML = '';

    document.querySelectorAll('.slider').forEach(slider => {
        slider.value = '5';
        slider.nextElementSibling.textContent = '5.0';
    });

    calculateAllRatings();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}