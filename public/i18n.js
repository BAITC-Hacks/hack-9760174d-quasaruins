/**
 * Akim Lab language switch: Қазақша / Русский / English.
 *
 * Self-contained module. It adds one language button to the HUD (each click cycles ҚАЗ → РУС → ENG) and translates
 * the rendered UI in place.
 * Text is matched by its exact English wording, plus a few patterns for strings that carry numbers or names,
 * so app.js, city.js and the shared model keep producing English and need no changes. Unknown text stays in
 * English. A MutationObserver keeps re-rendered cards, HUD values, dialogs and map labels translated.
 * The choice is remembered per browser; ?lang=kk|ru|en forces a language.
 */
const LANGUAGES = [
  { id: 'kk', label: 'ҚАЗ', name: 'Қазақша' },
  { id: 'ru', label: 'РУС', name: 'Русский' },
  { id: 'en', label: 'ENG', name: 'English' },
];
const STORAGE_KEY = 'akimlab-language';
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);

// [English, Kazakh, Russian]
const ENTRIES = [
  // Page and HUD
  ['Akim Lab — One city, two futures', 'Akim Lab — Бір қала, екі болашақ', 'Akim Lab — Один город, два будущих'],
  ['Budget used', 'Жұмсалған бюджет', 'Потрачено бюджета'],
  ['Project slots ↗', 'Жобалар ↗', 'Проекты ↗'],
  ['Baseline', 'Бастапқы деңгей', 'Исходный уровень'],
  ['Official score', 'Ресми балл', 'Официальный балл'],
  ['Official at Q8', 'Ресми нәтиже: 8-тоқсан', 'Итог — в 8-м квартале'],
  ['Plan A · official', 'А жоспары · ресми', 'План А · официально'],
  ['Weakest · baseline', 'Ең әлсіз · бастапқы', 'Самый слабый · исходно'],
  ['Weakest · illustrative', 'Ең әлсіз · иллюстрация', 'Самый слабый · условно'],
  ['Weakest district', 'Ең әлсіз аудан', 'Самый слабый район'],
  ['Indicators <40', 'Көрсеткіштер <40', 'Показатели <40'],
  ['Illustrative replay count', 'Иллюстрациялық қайталаудағы саны', 'Число в иллюстративном повторе'],
  ['Official count', 'Ресми саны', 'Официальное число'],
  ['Baseline count', 'Бастапқы саны', 'Исходное число'],
  ['Statistics', 'Статистика', 'Статистика'],
  ['Timeline', 'Уақыт желісі', 'Хронология'],
  ['City windows', 'Қала терезелері', 'Окна города'],
  ['About this scenario', 'Сценарий туралы', 'О сценарии'],
  ['BASELINE CITY', 'БАСТАПҚЫ ҚАЛА', 'ИСХОДНЫЙ ГОРОД'],
  ['PINNED PLAN A', 'БЕКІТІЛГЕН А ЖОСПАРЫ', 'ЗАКРЕПЛЁННЫЙ ПЛАН А'],
  ['YOUR FUTURE CITY', 'СІЗДІҢ БОЛАШАҚ ҚАЛАҢЫЗ', 'ВАШ ГОРОД БУДУЩЕГО'],
  ['DRAFT · PROJECT PREVIEW', 'ЖОБА · АЛДЫН АЛА КӨРІНІС', 'ЧЕРНОВИК · ПРЕДПРОСМОТР'],
  ['Fit city', 'Бүкіл қала', 'Весь город'],
  ['Fit the whole city', 'Бүкіл қаланы көрсету', 'Показать весь город'],
  ['Pause', 'Кідірту', 'Пауза'],
  ['Resume', 'Жалғастыру', 'Продолжить'],
  ['Reduced motion', 'Қозғалыс азайтылған', 'Анимация снижена'],
  ['Replay speed', 'Қайталау жылдамдығы', 'Скорость повтора'],
  ['Before', 'Бұрын', 'До'],
  ['Your plan', 'Сіздің жоспар', 'Ваш план'],
  ['Plan A', 'А жоспары', 'План А'],
  ['Compare city views', 'Қала көріністерін салыстыру', 'Сравнить виды города'],
  ['Choose a district', 'Ауданды таңдаңыз', 'Выберите район'],
  ['Loading the city model…', 'Қала моделі жүктелуде…', 'Загружаем модель города…'],
  ['Preparing Astana…', 'Астана дайындалуда…', 'Готовим Астану…'],
  ['Astana miniature city', 'Астана макеті', 'Макет Астаны'],
  ['Isometric Astana city visualization', 'Астананың изометриялық көрінісі', 'Изометрическая визуализация Астаны'],
  ['Map & scenario sources', 'Карта және сценарий дереккөздері', 'Источники карты и сценария'],
  ['Real geography · illustrative buildings', 'Нақты география · иллюстрациялық ғимараттар', 'Реальная география · условные здания'],
  ['Map source and attribution', 'Карта дереккөзі және авторлығы', 'Источник карты и авторство'],
  ['Skip to projects', 'Жобаларға өту', 'К проектам'],

  // Project deck
  ['Project library', 'Жобалар кітапханасы', 'Библиотека проектов'],
  ['Project cards', 'Жоба карточкалары', 'Карточки проектов'],
  ['Project details', 'Жоба мәліметтері', 'Детали проекта'],
  ['available projects', 'қолжетімді жоба', 'доступных проектов'],
  ['Filter projects by category', 'Жобаларды санат бойынша сүзу', 'Фильтр проектов по категориям'],
  ['Scroll to next projects', 'Келесі жобалар', 'Следующие проекты'],
  ['Scroll to previous projects', 'Алдыңғы жобалар', 'Предыдущие проекты'],
  ['Undo last plan edit', 'Соңғы өзгерісті болдырмау', 'Отменить последнее изменение'],
  ['All', 'Барлығы', 'Все'],
  ['Transport', 'Көлік', 'Транспорт'],
  ['Ecology', 'Экология', 'Экология'],
  ['Social', 'Әлеуметтік', 'Социальные'],
  ['Safety', 'Қауіпсіздік', 'Безопасность'],
  ['Services', 'Қызметтер', 'Услуги'],
  ['Social infrastructure', 'Әлеуметтік инфрақұрылым', 'Социальная инфраструктура'],
  ['City services', 'Қалалық қызметтер', 'Городские услуги'],
  ['Example', 'Мысал', 'Пример'],
  ['Reset', 'Тазарту', 'Сброс'],
  ['Start', 'Бастау', 'Старт'],
  ['Complete', 'Аяқталды', 'Готово'],
  ['units', 'бірлік', 'ед.'],
  ['City-wide', 'Бүкіл қала', 'Весь город'],
  ['One district', 'Бір аудан', 'Один район'],
  ['Choose a card, then a district.', 'Жоба карточкасын, содан кейін ауданды таңдаңыз.', 'Выберите карточку, затем район.'],
  ['Up to 2 per category · 8 quarters', 'Әр санаттан 2 жобаға дейін · 8 тоқсан', 'До 2 проектов на категорию · 8 кварталов'],
  ['Click a district to place your project.', 'Жобаны орналастыру үшін ауданды басыңыз.', 'Нажмите на район, чтобы разместить проект.'],
  ['Change a choice to try another future', 'Басқа болашақты көру үшін таңдауды өзгертіңіз', 'Измените выбор, чтобы увидеть другое будущее'],
  ['Ready to see your city change', 'Қаланың өзгерісін көруге дайын', 'Всё готово — посмотрите, как изменится город'],
  ['Now click a district on the map or use its labeled button.', 'Енді картадан ауданды басыңыз немесе оның батырмасын қолданыңыз.', 'Теперь нажмите на район на карте или на его кнопку.'],
  ['Select this card to add it across all five districts.', 'Бес ауданның барлығына қосу үшін осы карточканы таңдаңыз.', 'Выберите карточку, чтобы добавить проект во все пять районов.'],
  ['Select this card, then choose its district.', 'Осы карточканы таңдап, содан кейін ауданды таңдаңыз.', 'Выберите карточку, затем район.'],
  ['Remove this project', 'Бұл жобаны алып тастау', 'Убрать проект'],
  ['Close project details', 'Жоба мәліметтерін жабу', 'Закрыть детали проекта'],

  // Card names
  ['Bus lanes', 'Автобус жолақтары', 'Автобусные полосы'],
  ['Smart signals', 'Ақылды бағдаршамдар', 'Умные светофоры'],
  ['Light rail', 'Жеңіл метро', 'Лёгкое метро'],
  ['New park', 'Жаңа саябақ', 'Новый парк'],
  ['Clean fuel', 'Таза отын', 'Чистое топливо'],
  ['City greening', 'Көгалдандыру', 'Озеленение'],
  ['School & daycare', 'Мектеп пен балабақша', 'Школа и детсад'],
  ['Health clinic', 'Емхана', 'Поликлиника'],
  ['Sports hubs', 'Спорт алаңдары', 'Спортплощадки'],
  ['Safer streets', 'Қауіпсіз көшелер', 'Безопасные улицы'],
  ['Safe crossings', 'Қауіпсіз өткелдер', 'Безопасные переходы'],
  ['Digital requests', 'Цифрлық өтініштер', 'Цифровые обращения'],
  ['Water & heating', 'Су және жылу', 'Вода и тепло'],
  ['Utility crews', 'Апаттық бригадалар', 'Аварийные бригады'],

  // Projects (full names and descriptions)
  ['Dedicated bus lanes', 'Бөлінген автобус жолақтары', 'Выделенные автобусные полосы'],
  ['Smart traffic signals', 'Ақылды бағдаршамдар', 'Умные светофоры'],
  ['Light rail expansion', 'Жеңіл метроны кеңейту', 'Расширение лёгкого метро'],
  ['Neighborhood park', 'Аудандық саябақ', 'Районный парк'],
  ['Clean household fuel', 'Үйлерге таза отын', 'Чистое бытовое топливо'],
  ['City greening program', 'Қаланы көгалдандыру бағдарламасы', 'Программа озеленения города'],
  ['School and kindergarten', 'Мектеп және балабақша', 'Школа и детский сад'],
  ['Family health clinic', 'Отбасылық емхана', 'Семейная поликлиника'],
  ['Courtyard sports hubs', 'Аулалық спорт алаңдары', 'Дворовые спортплощадки'],
  ['Lighting and cameras', 'Жарықтандыру және камералар', 'Освещение и камеры'],
  ['Safer school crossings', 'Мектеп маңындағы қауіпсіз өткелдер', 'Безопасные школьные переходы'],
  ['Digital resident requests', 'Тұрғындардың цифрлық өтініштері', 'Цифровые обращения жителей'],
  ['Heating and water networks', 'Жылу және су желілері', 'Тепловые и водопроводные сети'],
  ['Emergency utility crews', 'Коммуналдық апаттық бригадалар', 'Аварийные коммунальные бригады'],
  ['Give buses dedicated road space.', 'Автобустарға жеке жолақ бөлу.', 'Выделить автобусам отдельные полосы.'],
  ['Adapt signals across the five modeled districts.', 'Бес аудандағы бағдаршамдарды қозғалысқа бейімдеу.', 'Адаптивные светофоры во всех пяти районах.'],
  ['Expand light rail service in one district.', 'Бір ауданда жеңіл метро қызметін кеңейту.', 'Расширить лёгкое метро в одном районе.'],
  ['Create a park or green square.', 'Саябақ немесе жасыл сквер салу.', 'Создать парк или зелёный сквер.'],
  ['Move private-sector homes to cleaner fuel.', 'Жеке сектор үйлерін таза отынға көшіру.', 'Перевести частный сектор на чистое топливо.'],
  ['Plant city greenery and windbreaks.', 'Қалаға жасыл желек пен желден қорғайтын белдеулер отырғызу.', 'Высадить зелень и ветрозащитные полосы.'],
  ['Add modular school and childcare capacity.', 'Модульдік мектеп пен балабақша орындарын қосу.', 'Добавить модульные места в школах и детсадах.'],
  ['Expand primary healthcare close to residents.', 'Тұрғындарға жақын алғашқы медициналық көмекті кеңейту.', 'Приблизить первичную медпомощь к жителям.'],
  ['Create active neighborhood gathering places.', 'Аулаларда белсенді демалыс орындарын ашу.', 'Создать активные места отдыха во дворах.'],
  ['Extend Safe City lighting and camera coverage.', '«Қауіпсіз қала» жарығы мен камераларын кеңейту.', 'Расширить освещение и камеры «Безопасного города».'],
  ['Improve crossings and school zones; road flow decreases.', 'Өткелдер мен мектеп аймақтарын жақсарту; көлік ағыны баяулайды.', 'Улучшить переходы и школьные зоны; поток машин снижается.'],
  ['Unify handling of resident service requests.', 'Тұрғындар өтініштерін өңдеуді біріздендіру.', 'Единая обработка обращений жителей.'],
  ['Modernize district utility networks.', 'Аудандық коммуналдық желілерді жаңарту.', 'Модернизировать коммунальные сети района.'],
  ['Improve utility response and early warning.', 'Коммуналдық апаттарға әрекет ету мен ерте ескертуді жақсарту.', 'Ускорить реагирование коммунальных служб и раннее оповещение.'],

  // Indicators
  ['Road flow', 'Көлік ағыны', 'Дорожный поток'],
  ['Public transport access', 'Қоғамдық көлікке қолжетімділік', 'Доступ к общественному транспорту'],
  ['Green space', 'Жасыл аймақ', 'Зелёные зоны'],
  ['Air quality', 'Ауа сапасы', 'Качество воздуха'],
  ['Schools and childcare', 'Мектептер мен балабақшалар', 'Школы и детсады'],
  ['Primary healthcare', 'Алғашқы медициналық көмек', 'Первичная медпомощь'],
  ['Street safety', 'Көше қауіпсіздігі', 'Безопасность улиц'],
  ['Road safety', 'Жол қауіпсіздігі', 'Безопасность дорог'],
  ['Utility reliability', 'Коммуналдық сенімділік', 'Надёжность ЖКХ'],
  ['Resident request response', 'Тұрғындар өтініштеріне жауап', 'Ответ на обращения жителей'],
  ['Higher means less peak-hour congestion.', 'Жоғары мән — қарбалас уақытта кептеліс аз.', 'Выше — меньше пробок в час пик.'],
  ['Access to frequent nearby public transport.', 'Жақын әрі жиі жүретін қоғамдық көлік.', 'Частый общественный транспорт рядом с домом.'],
  ['Availability of greenery per resident.', 'Бір тұрғынға шаққандағы жасыл желек.', 'Озеленение на одного жителя.'],
  ['Higher means cleaner air and less winter smog.', 'Жоғары мән — ауа таза, қыстағы түтін аз.', 'Выше — чище воздух и меньше зимнего смога.'],
  ['School and kindergarten capacity relative to need.', 'Мектеп пен балабақша орындарының қажеттілікке сәйкестігі.', 'Места в школах и детсадах относительно потребности.'],
  ['Local clinics and primary care capacity.', 'Жергілікті емханалар мен алғашқы көмек мүмкіндігі.', 'Поликлиники рядом и мощность первичной помощи.'],
  ['Lighting, coverage and safer public space.', 'Жарық, бақылау және қауіпсіз қоғамдық орындар.', 'Освещение, камеры и безопасные общественные места.'],
  ['Higher means fewer serious traffic incidents.', 'Жоғары мән — ауыр жол оқиғалары аз.', 'Выше — меньше серьёзных ДТП.'],
  ['Reliability of heating and water services.', 'Жылу мен су қызметтерінің сенімділігі.', 'Надёжность тепло- и водоснабжения.'],
  ['Timely resolution of residents’ requests.', 'Тұрғындар өтініштерін уақтылы шешу.', 'Своевременное решение обращений жителей.'],

  // Districts, services and map labels
  ['Esil', 'Есіл', 'Есиль'],
  ['Almaty', 'Алматы', 'Алматы'],
  ['Saryarka', 'Сарыарқа', 'Сарыарка'],
  ['Baikonur', 'Байқоңыр', 'Байконур'],
  ['Nura', 'Нұра', 'Нура'],
  ['Sarayshyk', 'Сарайшық', 'Сарайшык'],
  ['All five districts', 'Барлық бес аудан', 'Все пять районов'],
  ['Outside this scenario', 'Сценарийден тыс', 'Вне сценария'],
  ['Sarayshyk · outside scenario', 'Сарайшық · сценарийден тыс', 'Сарайшык · вне сценария'],
  ['No synthetic scenario data for this district', 'Бұл аудан үшін сценарий деректері жоқ', 'Для этого района нет данных сценария'],
  ['School', 'Мектеп', 'Школа'],
  ['Clinic', 'Емхана', 'Поликлиника'],
  ['Safety post', 'Қауіпсіздік бекеті', 'Пост безопасности'],
  ['Utilities', 'Коммуналдық қызмет', 'Коммунальные службы'],
  ['Service centre', 'ХҚКО', 'ЦОН'],
  ['Transit stop', 'Аялдама', 'Остановка'],
  ['Illustrative cars', 'Иллюстрациялық көліктер', 'Условные машины'],
  ['2D district view · all planning and calculations remain available', '2D аудан көрінісі · жоспарлау мен есептеу толық қолжетімді', '2D-вид районов · планирование и расчёты доступны'],
  ['The geographic view is unavailable. Select a district using the controls below.', 'Географиялық көрініс қолжетімсіз. Ауданды төмендегі батырмалар арқылы таңдаңыз.', 'Карта недоступна. Выберите район кнопками ниже.'],

  // Landmarks (names are used in accessible labels and tooltips)
  ['Bayterek', 'Бәйтерек', 'Байтерек'],
  ['Khan Shatyr', 'Хан Шатыр', 'Хан Шатыр'],
  ['Ak Orda', 'Ақорда', 'Акорда'],
  ['Peace Palace', 'Бейбітшілік сарайы', 'Дворец мира'],
  ['Palace of Peace and Reconciliation', 'Бейбітшілік пен келісім сарайы', 'Дворец мира и согласия'],
  ['Nur Alem / EXPO Sphere', 'Нұр Әлем / EXPO сферасы', 'Нур Алем / Сфера EXPO'],
  ['Astana Opera', 'Астана Опера', 'Астана Опера'],
  ['Kazakhstan Central Concert Hall', '«Қазақстан» орталық концерт залы', 'Центральный концертный зал «Казахстан»'],
  ['Astana Arena', 'Астана Арена', 'Астана Арена'],
  ['Abu Dhabi Plaza', 'Абу-Даби Плаза', 'Абу-Даби Плаза'],
  ['National Museum', 'Ұлттық музей', 'Национальный музей'],
  ['Mangilik El Triumphal Arch', '«Мәңгілік Ел» салтанат қақпасы', 'Триумфальная арка «Мангилик Ел»'],
  ['Hazret Sultan Mosque', 'Әзірет Сұлтан мешіті', 'Мечеть Хазрет Султан'],
  ['Kazakh Eli Monument', '«Қазақ Елі» монументі', 'Монумент «Казах Ели»'],
  ['Astana Grand Mosque', 'Астана Бас мешіті', 'Главная мечеть Астаны'],

  // Plan dialog and validation
  ['YOUR FIVE DECISIONS', 'СІЗДІҢ БЕС ШЕШІМІҢІЗ', 'ВАШИ ПЯТЬ РЕШЕНИЙ'],
  ['The project plan', 'Жобалар жоспары', 'План проектов'],
  ['Selected projects', 'Таңдалған жобалар', 'Выбранные проекты'],
  ['Close plan', 'Жоспарды жабу', 'Закрыть план'],
  ['Change a district, remove a project, or lock choices to keep them in adviser suggestions.', 'Ауданды өзгертіңіз, жобаны алып тастаңыз немесе кеңесші ұсыныстарында сақтау үшін таңдауды бекітіңіз.', 'Меняйте район, убирайте проекты или закрепляйте выбор, чтобы советник его сохранял.'],
  ['Your choice', 'Сіздің таңдауыңыз', 'Ваш выбор'],
  ['Keep in advice', 'Кеңесте сақтау', 'Сохранять в советах'],
  ['✓ Your five-project plan is ready. Simulate to see its impact.', '✓ Бес жобалық жоспарыңыз дайын. Әсерін көру үшін іске қосыңыз.', '✓ План из пяти проектов готов. Запустите, чтобы увидеть эффект.'],
  ['Resolve these issues before simulating.', 'Іске қоспас бұрын осы мәселелерді шешіңіз.', 'Исправьте эти ошибки перед запуском.'],
  ['Choose exactly five different projects.', 'Дәл бес түрлі жоба таңдаңыз.', 'Выберите ровно пять разных проектов.'],
  ['Every selection must be a project and district object.', 'Әр таңдауда жоба мен аудан болуы керек.', 'Каждый выбор должен содержать проект и район.'],
  ['Unknown project ID.', 'Белгісіз жоба.', 'Неизвестный проект.'],
  ['Choose one of the five modeled districts.', 'Бес ауданның бірін таңдаңыз.', 'Выберите один из пяти районов.'],
  ['Selections must be an array.', 'Таңдаулар тізім болуы керек.', 'Выбор должен быть списком.'],
  ['Choose either bus lanes or light rail, not both.', 'Не автобус жолақтарын, не жеңіл метроны таңдаңыз, екеуін бірге емес.', 'Выберите либо автобусные полосы, либо лёгкое метро, но не оба.'],
  ['A park and a school compete for the same district site.', 'Саябақ пен мектеп аудандағы бір учаскеге таласады.', 'Парк и школа претендуют на один участок в районе.'],
  ['Clean fuel and utility networks overlap in the same district.', 'Таза отын мен коммуналдық желілер бір ауданда қайталанады.', 'Чистое топливо и коммунальные сети пересекаются в одном районе.'],
  ['Complete a valid five-project plan before requesting an improvement.', 'Жақсарту сұрамас бұрын бес жобалық жарамды жоспарды аяқтаңыз.', 'Сначала завершите корректный план из пяти проектов.'],
  ['Locks must be unique project IDs in the current plan.', 'Тек ағымдағы жоспардағы әртүрлі жобаларды бекітуге болады.', 'Закреплять можно только разные проекты текущего плана.'],

  // Report dialog
  ['Your city, explained', 'Қалаңыз туралы түсіндірме', 'Ваш город: разбор'],
  ['Your plan · official score', 'Сіздің жоспар · ресми балл', 'Ваш план · официальный балл'],
  ['Pinned Plan A · official score', 'Бекітілген А жоспары · ресми балл', 'Закреплённый план А · официальный балл'],
  ['Baseline reference', 'Бастапқы деңгей', 'Исходный уровень'],
  ['BASELINE REFERENCE', 'БАСТАПҚЫ ДЕҢГЕЙ', 'ИСХОДНЫЙ УРОВЕНЬ'],
  ['QUARTER 8 · COMPLETED', '8-ТОҚСАН · АЯҚТАЛДЫ', 'КВАРТАЛ 8 · ЗАВЕРШЁН'],
  ['Illustrative progression, not a policy forecast. The official result is available at quarter 8.', 'Бұл иллюстрациялық барыс, болжам емес. Ресми нәтиже 8-тоқсанда шығады.', 'Это иллюстрация хода работ, а не прогноз. Официальный итог — в 8-м квартале.'],
  ['The city before intervention. This is not your draft plan’s score.', 'Қала жобаларға дейін. Бұл сіздің жоспарыңыздың балы емес.', 'Город до изменений. Это не балл вашего черновика.'],
  ['Critical indicators', 'Сындарлы көрсеткіштер', 'Критические показатели'],
  ['Values strictly below 40', '40-тан төмен мәндер', 'Значения ниже 40'],
  ['How the score is calculated', 'Балл қалай есептеледі', 'Как считается балл'],
  ['Official score = 70% population-weighted average + 30% weakest district − count of indicators below 40.', 'Ресми балл = халық санымен өлшенген орташаның 70% + ең әлсіз ауданның 30% − 40-тан төмен көрсеткіштер саны.', 'Официальный балл = 70% средневзвешенного по населению + 30% самого слабого района − число показателей ниже 40.'],
  ['City average × 0.7', 'Қала орташасы × 0.7', 'Среднее по городу × 0.7'],
  ['Weakest district × 0.3', 'Ең әлсіз аудан × 0.3', 'Самый слабый район × 0.3'],
  ['Critical penalty', 'Сындарлы айыппұл', 'Штраф за критические'],
  ['Effects use the supplied delays, then fixed synergy bonuses and clipping. Display values are rounded; the model retains full precision.', 'Әсерлер берілген кідірістермен, содан кейін тұрақты синергия бонустарымен және шектеумен есептеледі. Экрандағы мәндер дөңгелектелген; модель толық дәлдікті сақтайды.', 'Эффекты учитывают заданные задержки, затем фиксированные бонусы синергии и ограничения. Значения на экране округлены; модель хранит полную точность.'],
  ['Bus lanes and smart signals reinforce road flow.', 'Автобус жолақтары мен ақылды бағдаршамдар көлік ағынын күшейтеді.', 'Автобусные полосы и умные светофоры усиливают дорожный поток.'],
  ['Lighting and resident reporting reinforce street safety.', 'Жарықтандыру мен тұрғындар өтініштері көше қауіпсіздігін күшейтеді.', 'Освещение и обращения жителей повышают безопасность улиц.'],
  ['Cleaner fuel and greening reinforce air quality.', 'Таза отын мен көгалдандыру ауа сапасын жақсартады.', 'Чистое топливо и озеленение улучшают качество воздуха.'],
  ['Focus district', 'Таңдалған аудан', 'Выбранный район'],
  ['District indicators', 'Аудан көрсеткіштері', 'Показатели района'],
  ['Two possible futures', 'Екі ықтимал болашақ', 'Два возможных будущих'],
  ['Pin as Plan A ＋', 'А жоспары ретінде бекіту ＋', 'Закрепить как план А ＋'],
  ['Pin a completed plan, change one choice, then compare the two futures.', 'Аяқталған жоспарды бекітіп, бір таңдауды өзгертіңіз де, екі болашақты салыстырыңыз.', 'Закрепите готовый план, измените один выбор и сравните два будущих.'],
  ['CHANGES FROM PLAN A', 'А ЖОСПАРЫНАН АЙЫРМАШЫЛЫҚТАР', 'ОТЛИЧИЯ ОТ ПЛАНА А'],
  ['EXPLORE YOUR PROJECTS', 'ЖОБАЛАРЫҢЫЗДЫ ҚАРАҢЫЗ', 'ИЗУЧИТЕ СВОИ ПРОЕКТЫ'],
  ['Select a project to inspect', 'Қарау үшін жобаны таңдаңыз', 'Выберите проект для просмотра'],
  ['These project choices match Plan A.', 'Бұл таңдау А жоспарымен бірдей.', 'Этот выбор совпадает с планом А.'],
  ['GROUNDED AI ADVISER', 'ДЕРЕККЕ СҮЙЕНЕТІН AI КЕҢЕСШІ', 'AI-СОВЕТНИК НА ДАННЫХ МОДЕЛИ'],
  ['The policy briefing', 'Жоспар бойынша брифинг', 'Брифинг по плану'],
  ['Explain my plan', 'Жоспарымды түсіндір', 'Объяснить мой план'],
  ['Explaining…', 'Түсіндірілуде…', 'Объясняем…'],
  ['Find one improvement', 'Бір жақсартуды табу', 'Найти одно улучшение'],
  ['Checking changes…', 'Өзгерістер тексерілуде…', 'Проверяем изменения…'],
  ['Read briefing aloud', 'Брифингті дауыстап оқу', 'Прочитать вслух'],
  ['Stop', 'Тоқтату', 'Стоп'],
  ['Export plan JSON', 'Жоспарды JSON-ға экспорттау', 'Экспорт плана в JSON'],
  ['Print report', 'Есепті басып шығару', 'Печать отчёта'],
  ['Back to the city', 'Қалаға оралу', 'Вернуться в город'],
  ['AI-generated voice · displayed briefing is the transcript.', 'AI дауысы · экрандағы брифинг — оның мәтіні.', 'Голос AI · текст брифинга на экране.'],
  ['Preparing AI-generated voice · displayed briefing is the transcript.', 'AI дауысы дайындалуда · экрандағы брифинг — оның мәтіні.', 'Готовим голос AI · текст брифинга на экране.'],
  ['AI-generated voice · reading complete.', 'AI дауысы · оқу аяқталды.', 'Голос AI · чтение завершено.'],
  ['Browser voice · reading complete.', 'Браузер дауысы · оқу аяқталды.', 'Голос браузера · чтение завершено.'],
  ['Browser voice fallback · displayed briefing is the transcript.', 'Браузер дауысы · экрандағы брифинг — оның мәтіні.', 'Голос браузера · текст брифинга на экране.'],
  ['Speech unavailable', 'Дыбыс қолжетімсіз', 'Озвучка недоступна'],
  ['Audio unavailable. The complete briefing remains above.', 'Дыбыс жоқ. Толық брифинг жоғарыда.', 'Звук недоступен. Полный брифинг — выше.'],
  ['Reading stopped. The complete briefing remains above.', 'Оқу тоқтатылды. Толық брифинг жоғарыда.', 'Чтение остановлено. Полный брифинг — выше.'],
  ['Reading your calculated outcomes…', 'Есептелген нәтижелер оқылуда…', 'Читаем рассчитанные итоги…'],
  ['Checking every eligible one-project change…', 'Бір жобаны ауыстырудың барлық нұсқасы тексерілуде…', 'Проверяем все допустимые замены одного проекта…'],
  ['The server returned an unreadable response. Please try again.', 'Сервер оқылмайтын жауап қайтарды. Қайталап көріңіз.', 'Сервер вернул нечитаемый ответ. Попробуйте ещё раз.'],
  ['The server could not analyze this plan.', 'Сервер бұл жоспарды талдай алмады.', 'Сервер не смог проанализировать план.'],
  ['Live AI · grounded in model outputs', 'Тікелей AI · модель нәтижелеріне сүйенеді', 'Живой AI · опирается на расчёты модели'],
  ['Offline · deterministic explanation', 'Офлайн · тұрақты түсіндірме', 'Офлайн · детерминированное объяснение'],
  ['No explanation was returned.', 'Түсіндірме алынбады.', 'Объяснение не получено.'],
  ['View calculation evidence', 'Есептеу дәлелдерін көру', 'Показать расчёты'],
  ['The request timed out. Your plan and calculated results are safe; try again.', 'Сұрау уақыты бітті. Жоспарыңыз бен нәтижелер сақталған; қайталап көріңіз.', 'Время запроса истекло. План и результаты сохранены; попробуйте ещё раз.'],
  ['No improving one-project change was found.', 'Нәтижені жақсартатын бір жобалық өзгеріс табылмады.', 'Улучшающая замена одного проекта не найдена.'],
  ['The proposed change could not be verified against this plan. It has not been applied.', 'Ұсынылған өзгерісті тексеру мүмкін болмады. Ол қолданылмады.', 'Предложенное изменение не удалось проверить. Оно не применено.'],
  ['Apply verified change ↗', 'Тексерілген өзгерісті қолдану ↗', 'Применить проверенное изменение ↗'],

  // Timeline and about dialogs
  ['CITY STATISTICS', 'ҚАЛА СТАТИСТИКАСЫ', 'СТАТИСТИКА ГОРОДА'],
  ['Close statistics', 'Статистиканы жабу', 'Закрыть статистику'],
  ['EIGHT QUARTERS', 'СЕГІЗ ТОҚСАН', 'ВОСЕМЬ КВАРТАЛОВ'],
  ['A city over time', 'Уақыт өте келе қала', 'Город во времени'],
  ['Close timeline', 'Уақыт желісін жабу', 'Закрыть хронологию'],
  ['Start a valid five-project plan to see its construction replay.', 'Құрылыс барысын көру үшін бес жобадан тұратын жарамды жоспарды бастаңыз.', 'Запустите корректный план из пяти проектов, чтобы увидеть ход строительства.'],
  ['Current run: quarter 0 is baseline; quarters 1–7 are illustrative, not forecasts. Only quarter 8 is the official result.', 'Ағымдағы іске қосу: 0-тоқсан — бастапқы деңгей; 1–7 тоқсан — болжам емес, иллюстрация. Тек 8-тоқсан — ресми нәтиже.', 'Текущий запуск: квартал 0 — исходный уровень; кварталы 1–7 — иллюстрация, а не прогноз. Официальный итог — только квартал 8.'],
  ['City index', 'Қала индексі', 'Индекс города'],
  ['City and district indices by quarter. Exact values are in the following table.', 'Қала мен аудан индекстері тоқсан бойынша. Нақты мәндер төмендегі кестеде.', 'Индексы города и районов по кварталам. Точные значения — в таблице ниже.'],
  ['Quarterly replay values', 'Тоқсандық мәндер', 'Значения по кварталам'],
  ['Quarter', 'Тоқсан', 'Квартал'],
  ['A model, made visible', 'Көрнекі модель', 'Модель, которую видно'],
  ['Close about', 'Жабу', 'Закрыть'],
  ['Organizer-supplied synthetic district indicators and project effects. This is a decision simulator, not a prediction of real policy outcomes.', 'Аудан көрсеткіштері мен жобалардың әсері — ұйымдастырушылар берген синтетикалық деректер. Бұл — шешім қабылдау симуляторы, нақты саясат нәтижелерінің болжамы емес.', 'Показатели районов и эффекты проектов — синтетические данные организаторов. Это симулятор решений, а не прогноз реальных результатов политики.'],
  ['Geography: Astana public geoportal and attributed offline layers.', 'География: Астананың ашық геопорталы және дереккөзі көрсетілген офлайн қабаттар.', 'География: открытый геопортал Астаны и офлайн-слои с указанием источников.'],
  ['The real Astana backdrop includes Sarayshyk, outside this five-district scenario. Buildings, interventions, traffic and citizen reactions are illustrative. Quarter 1–7 values are an illustrative replay; quarter 8 is the official scenario outcome.', 'Нақты Астана картасында осы бес аудандық сценарийге кірмейтін Сарайшық ауданы да бар. Ғимараттар, жобалар, көлік қозғалысы мен тұрғындардың реакциясы — иллюстрация. 1–7 тоқсан мәндері — иллюстрациялық қайталау, 8-тоқсан — сценарийдің ресми нәтижесі.', 'На реальной карте Астаны есть и Сарайшык — он вне этого сценария из пяти районов. Здания, проекты, трафик и реакции жителей условны. Кварталы 1–7 — иллюстративный повтор; квартал 8 — официальный итог сценария.'],
  ['Drag to orbit · scroll to zoom · choose a district by map or labeled button. All project details are available by tap and keyboard focus.', 'Айналдыру үшін сүйреңіз · масштаб — дөңгелекпен · ауданды картадан немесе батырмадан таңдаңыз. Жоба мәліметтері түрту және пернетақта арқылы қолжетімді.', 'Перетаскивайте для вращения · колесо — масштаб · район выбирается на карте или кнопкой. Детали проектов доступны по нажатию и с клавиатуры.'],
  ['Organizer-provided synthetic scenario for five modeled districts. The map backdrop uses real geography; indicator values are not observations or forecasts.', 'Бес аудан үшін ұйымдастырушылар берген синтетикалық сценарий. Карта нақты географияға негізделген; көрсеткіштер бақылау да, болжам да емес.', 'Синтетический сценарий организаторов для пяти районов. Карта основана на реальной географии; показатели — не наблюдения и не прогнозы.'],

  // Messages
  ['Construction started. Quarter 1–7 is illustrative; the official result arrives at quarter 8.', 'Құрылыс басталды. 1–7 тоқсан — иллюстрация; ресми нәтиже 8-тоқсанда.', 'Строительство началось. Кварталы 1–7 — иллюстрация; официальный итог — в 8-м квартале.'],
  ['The supplied example is ready: five projects, 95 units. Press Start to build your city.', 'Мысал дайын: бес жоба, 95 бірлік. Қаланы салу үшін «Бастау» батырмасын басыңыз.', 'Пример готов: пять проектов, 95 единиц. Нажмите «Старт», чтобы построить город.'],
  ['Plan A is pinned. Edit your choices to explore Plan B; switch views without moving the camera.', 'А жоспары бекітілді. Б жоспарын көру үшін таңдауды өзгертіңіз; көріністер камераны жылжытпай ауысады.', 'План А закреплён. Измените выбор, чтобы исследовать план Б; виды переключаются без движения камеры.'],
  ['Pinned Plan A. Amber rings mark projects that differ from your current choices.', 'Бекітілген А жоспары. Сарғылт шеңберлер қазіргі таңдауыңыздан өзгеше жобаларды белгілейді.', 'Закреплённый план А. Янтарные кольца отмечают проекты, отличающиеся от текущего выбора.'],
  ['The city before intervention. Your choices are preserved.', 'Қала жобаларға дейін. Таңдауларыңыз сақталған.', 'Город до изменений. Ваш выбор сохранён.'],
  ['Your validated end-state at 8 quarters. Buildings, road activity and reactions are illustrative; green rings mark changed projects.', 'Жоспарыңыздың 8 тоқсаннан кейінгі тексерілген нәтижесі. Ғимараттар, көлік пен реакциялар — иллюстрация; жасыл шеңберлер өзгерген жобаларды белгілейді.', 'Проверенный итог вашего плана через 8 кварталов. Здания, трафик и реакции условны; зелёные кольца отмечают изменённые проекты.'],
  ['Translucent projects are previews. Complete five choices and simulate to calculate official outcomes.', 'Мөлдір жобалар — алдын ала көрініс. Ресми нәтижені есептеу үшін бес таңдауды аяқтап, іске қосыңыз.', 'Полупрозрачные проекты — предпросмотр. Сделайте пять выборов и запустите расчёт официального итога.'],
  ['Organizer-supplied synthetic scenario. Geographic backdrop is real; buildings, projects and reactions are illustrative.', 'Ұйымдастырушылар берген синтетикалық сценарий. География нақты; ғимараттар, жобалар мен реакциялар — иллюстрация.', 'Синтетический сценарий организаторов. География реальная; здания, проекты и реакции условны.'],
  ['Saved draft restored.', 'Сақталған жоспар қалпына келтірілді.', 'Сохранённый черновик восстановлен.'],
  ['The 3D view is unavailable. Use the district controls below; planning and calculations still work.', '3D көрініс қолжетімсіз. Төмендегі аудан батырмаларын қолданыңыз; жоспарлау мен есептеу жұмыс істейді.', '3D-вид недоступен. Используйте кнопки районов ниже; планирование и расчёты работают.'],
  ['The city calculation model could not load. Your browser has not calculated a score. Reload to retry.', 'Қаланы есептеу моделі жүктелмеді. Балл есептелмеді. Бетті қайта жүктеңіз.', 'Модель расчёта не загрузилась. Балл не рассчитан. Перезагрузите страницу.'],
  ['Reload', 'Қайта жүктеу', 'Перезагрузить'],
  ['Nazarbayev University', 'Назарбаев Университеті', 'Назарбаев Университет'],
  ['Official Astana district outlines; use district buttons for keyboard selection.', 'Астананың ресми аудан шекаралары; пернетақтамен таңдау үшін аудан батырмаларын қолданыңыз.', 'Официальные границы районов Астаны; для выбора с клавиатуры используйте кнопки районов.'],
  ['Details', 'Толығырақ', 'Подробнее'],
  ['Drag to pan · right-drag to orbit · scroll to zoom · choose a district by map or labeled button. All project details are available by tap and keyboard focus.', 'Картаны жылжыту үшін сүйреңіз · айналдыру үшін оң батырмамен сүйреңіз · масштаб — дөңгелекпен · ауданды картадан немесе батырмадан таңдаңыз. Жоба мәліметтері түрту және пернетақта арқылы қолжетімді.', 'Перетаскивайте, чтобы сдвинуть карту · правой кнопкой — вращение · колесо — масштаб · район выбирается на карте или кнопкой. Детали проектов доступны по нажатию и с клавиатуры.'],
  // Card drag and hand (R12)
  ['Placed projects', 'Орналастырылған жобалар', 'Размещённые проекты'],
  ['District details', 'Аудан мәліметтері', 'Детали района'],
  ['Compare plans', 'Жоспарларды салыстыру', 'Сравнить планы'],
  ['Briefing details', 'Брифинг мәліметтері', 'Детали брифинга'],
  ['Drop on a district in the city.', 'Карточканы қаладағы ауданға апарып тастаңыз.', 'Перетащите карточку на район города.'],
  ['Sarayshyk is outside this five-district scenario.', 'Сарайшық бес аудандық сценарийге кірмейді.', 'Сарайшык не входит в сценарий из пяти районов.'],
  ['Return to the hand to remove this project.', 'Жобаны алып тастау үшін оны қолға қайтарыңыз.', 'Верните карточку в руку, чтобы убрать проект.'],
  ['Placement cancelled.', 'Орналастыру тоқтатылды.', 'Размещение отменено.'],
  ['Project returned to the hand.', 'Жоба қолға қайтарылды.', 'Проект возвращён в руку.'],
  ['Choose a district.', 'Ауданды таңдаңыз.', 'Выберите район.'],
  ['Illustrative reaction to this project’s computed effect before synergy; not measured resident sentiment.', 'Жобаның синергияға дейінгі есептелген әсеріне иллюстрациялық реакция; тұрғындардың нақты пікірі емес.', 'Условная реакция на расчётный эффект проекта до синергии; не измеренное мнение жителей.'],
  ['Q0 baseline', '0-тоқсан · бастапқы', 'Кв. 0 · исходно'],
  ['Q8 official', '8-тоқсан · ресми', 'Кв. 8 · официально'],
  ['Existing service at baseline.', 'Бастапқы деңгейдегі қолданыстағы нысан.', 'Существующий объект на исходном уровне.'],
  ['Project addition completed.', 'Жоба бойынша кеңейту аяқталды.', 'Расширение по проекту завершено.'],
  ['Project planned or under construction; existing service remains.', 'Жоба жоспарланған немесе салынуда; қолданыстағы нысан жұмыс істейді.', 'Проект запланирован или строится; существующий объект работает.'],
  ['The project library will appear when the shared model is available.', 'Модель жүктелгенде жобалар кітапханасы пайда болады.', 'Библиотека проектов появится, когда модель загрузится.'],
];
const DICT = new Map(ENTRIES.map(([en, kk, ru]) => [en, { kk, ru }]));

const signed = (value) => value.replace(/^-/, '−');
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// [pattern, { kk(match, t), ru(match, t) }]; t() translates an embedded name and returns it unchanged if unknown.
// A template may return null to fall through (for example when a captured part is not a known name).
const PATTERNS = [
  [/^(\d+) choices? left to make$/, { kk: (m) => `Тағы ${m[1]} таңдау қалды`, ru: (m) => `Осталось выбрать: ${m[1]}` }],
  [/^District · (\d+)q build$/, { kk: (m) => `Аудан · ${m[1]} тоқсан`, ru: (m) => `Район · ${m[1]} кв.` }],
  [/^Q(\d+) \/ 8 · (ILLUSTRATIVE REPLAY|BASELINE)( · PAUSED)?$/, {
    kk: (m) => `${m[1]}/8-ТОҚСАН · ${m[2] === 'BASELINE' ? 'БАСТАПҚЫ' : 'ИЛЛЮСТРАЦИЯЛЫҚ ҚАЙТАЛАУ'}${m[3] ? ' · КІДІРТІЛДІ' : ''}`,
    ru: (m) => `КВ. ${m[1]}/8 · ${m[2] === 'BASELINE' ? 'ИСХОДНО' : 'ИЛЛЮСТРАТИВНЫЙ ПОВТОР'}${m[3] ? ' · ПАУЗА' : ''}` }],
  [/^Q(\d+) \/ 8$/, { kk: (m) => `${m[1]}/8 тоқсан`, ru: (m) => `Кв. ${m[1]}/8` }],
  [/^Quarter (\d+) \/ 8 · illustrative replay$/, { kk: (m) => `${m[1]}/8 тоқсан · иллюстрациялық қайталау`, ru: (m) => `Квартал ${m[1]}/8 · иллюстративный повтор` }],
  [/^QUARTER (\d+) · ILLUSTRATIVE$/, { kk: (m) => `${m[1]}-ТОҚСАН · ИЛЛЮСТРАЦИЯ`, ru: (m) => `КВАРТАЛ ${m[1]} · ИЛЛЮСТРАЦИЯ` }],
  [/^Illustrative replay · quarter (\d+)$/, { kk: (m) => `Иллюстрациялық қайталау · ${m[1]}-тоқсан`, ru: (m) => `Иллюстративный повтор · квартал ${m[1]}` }],
  [/^Construction replay · quarter (\d+) \/ 8\. Official result at quarter 8\.$/, { kk: (m) => `Құрылыс барысы · ${m[1]}/8 тоқсан. Ресми нәтиже 8-тоқсанда.`, ru: (m) => `Ход строительства · квартал ${m[1]}/8. Официальный итог — в 8-м квартале.` }],
  [/^Quarter (\d+): illustrative construction replay\. Only quarter 8 is the official outcome\.$/, { kk: (m) => `${m[1]}-тоқсан: құрылыстың иллюстрациялық барысы. Ресми нәтиже тек 8-тоқсанда.`, ru: (m) => `Квартал ${m[1]}: иллюстрация хода строительства. Официальный итог — только в 8-м квартале.` }],
  [/^✓ Valid plan · (\d+) \/ (\d+) units · 5 projects$/, { kk: (m) => `✓ Жарамды жоспар · ${m[1]} / ${m[2]} бірлік · 5 жоба`, ru: (m) => `✓ План корректен · ${m[1]} / ${m[2]} ед. · 5 проектов` }],
  [/^✓ Pinned Plan A · (\d+) \/ (\d+) units · 5 projects$/, { kk: (m) => `✓ Бекітілген А жоспары · ${m[1]} / ${m[2]} бірлік · 5 жоба`, ru: (m) => `✓ Закреплённый план А · ${m[1]} / ${m[2]} ед. · 5 проектов` }],
  [/^✓ (.+)$/, { kk: (m, t, known) => (known(m[1]) ? `✓ ${t(m[1])}` : null), ru: (m, t, known) => (known(m[1]) ? `✓ ${t(m[1])}` : null) }],
  [/^(\d+) more projects? to complete your plan\. No draft score is calculated\.$/, { kk: (m) => `Жоспарды аяқтау үшін тағы ${m[1]} жоба керек. Алдын ала балл есептелмейді.`, ru: (m) => `Чтобы завершить план, нужно ещё проектов: ${m[1]}. Черновой балл не считается.` }],
  [/^(-?\d+) units available$/, { kk: (m) => `${m[1]} бірлік қалды`, ru: (m) => `Доступно ${m[1]} ед.` }],
  [/^(-?\d+) units over budget$/, { kk: (m) => `Бюджеттен ${m[1].replace('-', '')} бірлік асты`, ru: (m) => `Перерасход ${m[1].replace('-', '')} ед.` }],
  [/^Place in (.+)$/, { kk: (m, t) => `Орналастыру: ${t(m[1])}`, ru: (m, t) => `Разместить: ${t(m[1])}` }],
  [/^Place (.+): choose a district on the map\.$/, { kk: (m, t) => `${t(m[1])}: картадан ауданды таңдаңыз.`, ru: (m, t) => `${t(m[1])}: выберите район на карте.` }],
  [/^(Choose|Inspect) (.+), (\d+) units$/, { kk: (m, t) => `${t(m[2])}, ${m[3]} бірлік — ${m[1] === 'Choose' ? 'таңдау' : 'қарау'}`, ru: (m, t) => `${m[1] === 'Choose' ? 'Выбрать' : 'Открыть'}: ${t(m[2])}, ${m[3]} ед.` }],
  [/^(.+) · (\d+) units$/, { kk: (m, t, known) => (known(m[1]) ? `${t(m[1])} · ${m[2]} бірлік` : null), ru: (m, t, known) => (known(m[1]) ? `${t(m[1])} · ${m[2]} ед.` : null) }],
  [/^Base effects before delay · completes in quarter (\d+) · (City-wide|One district)$/, { kk: (m, t) => `Кідіріске дейінгі базалық әсер · ${m[1]}-тоқсанда аяқталады · ${t(m[2])}`, ru: (m, t) => `Базовый эффект до задержки · завершится в ${m[1]}-м квартале · ${t(m[2])}` }],
  [/^City complete · official score ([\d.]+) · ([+\-−][\d.]+) versus baseline\.$/, { kk: (m) => `Қала дайын · ресми балл ${m[1]} · бастапқымен салыстырғанда ${signed(m[2])}.`, ru: (m) => `Город готов · официальный балл ${m[1]} · ${signed(m[2])} к исходному уровню.` }],
  [/^Compared with the ([\d.]+) baseline, after 8 quarters\. Changes use unrounded model values\.$/, { kk: (m) => `Бастапқы ${m[1]} балмен салыстырғанда, 8 тоқсаннан кейін. Өзгерістер дөңгелектелмеген мәндермен есептелген.`, ru: (m) => `По сравнению с исходными ${m[1]}, через 8 кварталов. Изменения посчитаны по неокруглённым значениям.` }],
  [/^([\d.]+) district index$/, { kk: (m) => `аудан индексі ${m[1]}`, ru: (m) => `индекс района ${m[1]}` }],
  [/^(\d+) at baseline · below 40$/, { kk: (m) => `бастапқыда ${m[1]} · 40-тан төмен`, ru: (m) => `исходно ${m[1]} · ниже 40` }],
  [/^(\d+)% of population$/, { kk: (m) => `халықтың ${m[1]}%`, ru: (m) => `${m[1]}% населения` }],
  [/^(.+) · indicators$/, { kk: (m, t) => `${t(m[1])} · көрсеткіштер`, ru: (m, t) => `${t(m[1])} · показатели` }],
  [/^Full-precision change: (.+)$/, { kk: (m) => `Толық дәлдіктегі өзгеріс: ${m[1]}`, ru: (m) => `Изменение с полной точностью: ${m[1]}` }],
  [/^Plan A is saved at ([\d.]+)\. Complete your current run to compare\.$/, { kk: (m) => `А жоспары ${m[1]} балмен сақталды. Салыстыру үшін ағымдағы іске қосуды аяқтаңыз.`, ru: (m) => `План А сохранён с баллом ${m[1]}. Завершите текущий запуск, чтобы сравнить.` }],
  [/^(\d+) added · (\d+) removed$/, { kk: (m) => `${m[1]} қосылды · ${m[2]} алынды`, ru: (m) => `добавлено: ${m[1]} · убрано: ${m[2]}` }],
  [/^Replace: (.+) · (.+)$/, { kk: (m, t) => `Ауыстыру: ${t(m[1])} · ${t(m[2])}`, ru: (m, t) => `Заменить: ${t(m[1])} · ${t(m[2])}` }],
  [/^With: (.+) · (.+)$/, { kk: (m, t) => `Орнына: ${t(m[1])} · ${t(m[2])}`, ru: (m, t) => `На: ${t(m[1])} · ${t(m[2])}` }],
  [/^Cost (\d+)\/100\. Best one-change search; not a global optimum\.$/, { kk: (m) => `Құны ${m[1]}/100. Бір өзгеріс бойынша ең жақсы нұсқа; жаһандық оптимум емес.`, ru: (m) => `Стоимость ${m[1]}/100. Лучшая замена одного проекта; не глобальный оптимум.` }],
  [/^([\d.]+) · ([+\-−][\d.]+) improvement$/, { kk: (m) => `${m[1]} · ${signed(m[2])} жақсарту`, ru: (m) => `${m[1]} · улучшение ${signed(m[2])}` }],
  [/^The plan costs (\d+); the budget is (\d+)\.$/, { kk: (m) => `Жоспар құны ${m[1]}; бюджет ${m[2]}.`, ru: (m) => `План стоит ${m[1]}; бюджет ${m[2]}.` }],
  [/^(.+) can only be selected once\.$/, { kk: (m, t) => `«${t(m[1])}» тек бір рет таңдалады.`, ru: (m, t) => `«${t(m[1])}» можно выбрать только один раз.` }],
  [/^Choose a district for (.+)\.$/, { kk: (m, t) => `«${t(m[1])}» үшін ауданды таңдаңыз.`, ru: (m, t) => `Выберите район для проекта «${t(m[1])}».` }],
  [/^(.+) applies across the modeled city\.$/, { kk: (m, t) => `«${t(m[1])}» бүкіл қалаға қолданылады.`, ru: (m, t) => `«${t(m[1])}» действует на весь город.` }],
  [/^Choose at most two (.+) projects\.$/, { kk: (m, t) => `«${t(capitalize(m[1]))}» санатынан ең көбі екі жоба таңдаңыз.`, ru: (m, t) => `Выберите не больше двух проектов категории «${t(capitalize(m[1]))}».` }],
  [/^(.+) placed across all five districts\.$/, { kk: (m, t) => `«${t(m[1])}» барлық бес ауданға орналастырылды.`, ru: (m, t) => `«${t(m[1])}» размещён во всех пяти районах.` }],
  [/^(.+) placed in (.+)\.$/, { kk: (m, t) => `«${t(m[1])}» орналастырылды: ${t(m[2])}.`, ru: (m, t) => `«${t(m[1])}» размещён: ${t(m[2])}.` }],
  [/^Placed: (.+)\. Manage districts and locks in Project slots\.$/, { kk: (m, t) => `Орны: ${t(m[1])}. Аудандар мен бекітулерді «Жобалар» бөлімінде басқарыңыз.`, ru: (m, t) => `Размещено: ${t(m[1])}. Районы и закрепления — в разделе «Проекты».` }],
  [/^Remove (.+)$/, { kk: (m, t) => `Алып тастау: ${t(m[1])}`, ru: (m, t) => `Убрать: ${t(m[1])}` }],
  [/^District for (.+)$/, { kk: (m, t) => `Аудан: ${t(m[1])}`, ru: (m, t) => `Район для проекта «${t(m[1])}»` }],
  [/^Keep (.+) and its district in recommendations$/, { kk: (m, t) => `«${t(m[1])}» мен оның ауданын ұсыныстарда сақтау`, ru: (m, t) => `Сохранять «${t(m[1])}» и его район в рекомендациях` }],
  [/^(.+) in (.+), (existing service|project upgraded)$/, { kk: (m, t) => `${t(m[1])}, ${t(m[2])}: ${m[3] === 'existing service' ? 'қолданыстағы нысан' : 'жоба арқылы жақсартылды'}`, ru: (m, t) => `${t(m[1])}, ${t(m[2])}: ${m[3] === 'existing service' ? 'существующий объект' : 'улучшено проектом'}` }],
  [/^(.+) · Outside this scenario$/, { kk: (m, t) => `${t(m[1])} · сценарийден тыс`, ru: (m, t) => `${t(m[1])} · вне сценария` }],
  [/^(.+) · mapped location, stylized model$/, { kk: (m, t) => `${t(m[1])} · картадағы орны, стильдендірілген модель`, ru: (m, t) => `${t(m[1])} · место по карте, стилизованная модель` }],
  [/^Q(\d+) illustrative$/, { kk: (m) => `${m[1]}-тоқсан · иллюстрация`, ru: (m) => `Кв. ${m[1]} · условно` }],
  [/^((?:M\d+)(?: \+ M\d+)+) · (.+?): (.+)$/, { kk: (m, t) => `${m[1]} · ${t(m[2])}: ${t(m[3])}`, ru: (m, t) => `${m[1]} · ${t(m[2])}: ${t(m[3])}` }],
  [/^(.+) · representative existing (.+), illustrative location\. (.+): ([\d.]+)( \(baseline [\d.]+\))?\. (.+)$/, {
    kk: (m, t) => `${t(m[1])} · ${t(capitalize(m[2]))} (иллюстрациялық орын). ${t(m[3])}: ${m[4]}${m[5] ? ` (бастапқы ${m[5].match(/[\d.]+/)[0]})` : ''}. ${t(m[6])}`,
    ru: (m, t) => `${t(m[1])} · ${t(capitalize(m[2]))} (условное место). ${t(m[3])}: ${m[4]}${m[5] ? ` (исходно ${m[5].match(/[\d.]+/)[0]})` : ''}. ${t(m[6])}` }],
  [/^(.+), district score ([\d.]+)(?:, change ([+\-−][\d.]+))?$/, {
    kk: (m, t) => `${t(m[1])}, аудан балы ${m[2]}${m[3] ? `, өзгеріс ${signed(m[3])}` : ''}`,
    ru: (m, t) => `${t(m[1])}, балл района ${m[2]}${m[3] ? `, изменение ${signed(m[3])}` : ''}` }],
  [/^([A-Z]\d): (.+)$/, { kk: (m, t, known) => (known(m[2]) ? `${m[1]}: ${t(m[2])}` : null), ru: (m, t, known) => (known(m[2]) ? `${m[1]}: ${t(m[2])}` : null) }],
  [/^Focus (.+) city-wide$/, { kk: (m, t) => `Көрсету: ${t(m[1])} · бүкіл қала`, ru: (m, t) => `Показать: ${t(m[1])} · весь город` }],
  [/^Focus (.+) in (.+)$/, { kk: (m, t, known) => (known(m[2]) ? `Көрсету: ${t(m[1])} · ${t(m[2])}` : null), ru: (m, t, known) => (known(m[2]) ? `Показать: ${t(m[1])} · ${t(m[2])}` : null) }],
  [/^(.+) — realized project effects before synergy$/, {
    kk: (m, t) => `${m[1].split('; ').map((part) => part.replace(/^(.+): /, (_, name) => `${t(name)}: `)).join('; ')} — синергияға дейінгі жоба әсерлері`,
    ru: (m, t) => `${m[1].split('; ').map((part) => part.replace(/^(.+): /, (_, name) => `${t(name)}: `)).join('; ')} — эффекты проектов до синергии` }],
  [/^(.+) ([+\-−][\d.]+) \(base effect\)$/, { kk: (m, t, known) => (known(m[1]) ? `${t(m[1])} ${signed(m[2])} (базалық әсер)` : null), ru: (m, t, known) => (known(m[1]) ? `${t(m[1])} ${signed(m[2])} (базовый эффект)` : null) }],
  [/^(\d+) units · (.+)$/, { kk: (m, t, known) => (known(m[2]) ? `${m[1]} бірлік · ${t(m[2])}` : null), ru: (m, t, known) => (known(m[2]) ? `${m[1]} ед. · ${t(m[2])}` : null) }],
  [/^(.+) · (.+) · (\d+) units$/, { kk: (m, t, known) => (known(m[1]) && known(m[2]) ? `${t(m[1])} · ${t(m[2])} · ${m[3]} бірлік` : null), ru: (m, t, known) => (known(m[1]) && known(m[2]) ? `${t(m[1])} · ${t(m[2])} · ${m[3]} ед.` : null) }],
  // A list of effect chips joined with " · ", e.g. "Road flow +16 · Air quality +4".
  [/^(.+ [+\-−][\d.]+)( · .+ [+\-−][\d.]+)+$/, {
    kk: (m, t, known) => { const parts = m[0].split(' · ').map((part) => part.match(/^(.+) ([+\-−][\d.]+)$/)); return parts.every((part) => part && known(part[1])) ? parts.map((part) => `${t(part[1])} ${signed(part[2])}`).join(' · ') : null; },
    ru: (m, t, known) => { const parts = m[0].split(' · ').map((part) => part.match(/^(.+) ([+\-−][\d.]+)$/)); return parts.every((part) => part && known(part[1])) ? parts.map((part) => `${t(part[1])} ${signed(part[2])}`).join(' · ') : null; } }],
  // Two known names joined with " · ", e.g. "Dedicated bus lanes · Esil".
  [/^([^·]+) · ([^·]+)$/, { kk: (m, t, known) => (known(m[1]) && known(m[2]) ? `${t(m[1])} · ${t(m[2])}` : null), ru: (m, t, known) => (known(m[1]) && known(m[2]) ? `${t(m[1])} · ${t(m[2])}` : null) }],
  // Reaction bubbles such as "♥ +10 Schools and childcare".
  [/^(\S+) ([+\-−][\d.]+) (.+)$/, { kk: (m, t, known) => (known(m[3]) ? `${m[1]} ${signed(m[2])} ${t(m[3])}` : null), ru: (m, t, known) => (known(m[3]) ? `${m[1]} ${signed(m[2])} ${t(m[3])}` : null) }],
  [/^(.+) \+$/, { kk: (m, t, known) => (known(m[1]) ? `${t(m[1])} +` : null), ru: (m, t, known) => (known(m[1]) ? `${t(m[1])} +` : null) }],
  // Effect chips such as "Road flow +16" or "Air quality −2".
  [/^(.+?):? ([+\-−]\d+(?:\.\d+)?)$/, { kk: (m, t, known) => (known(m[1]) ? `${t(m[1])} ${signed(m[2])}` : null), ru: (m, t, known) => (known(m[1]) ? `${t(m[1])} ${signed(m[2])}` : null) }],
];

const cache = { kk: new Map(), ru: new Map() };
const normalize = (text) => text.replace(/\s+/g, ' ').trim();

export function translate(text, language = current) {
  if (language === 'en' || typeof text !== 'string') return text;
  const core = normalize(text);
  if (!core || !/[A-Za-z]/.test(core)) return text;
  const out = lookup(core, language);
  if (out == null) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  return lead + out + trail;
}

function lookup(core, language) {
  const memo = cache[language];
  if (memo.has(core)) return memo.get(core);
  let out = DICT.get(core)?.[language] ?? null;
  if (out == null) {
    const t = (part) => lookup(part, language) ?? part;
    const known = (part) => DICT.has(part);
    for (const [pattern, forms] of PATTERNS) {
      const match = core.match(pattern);
      if (!match) continue;
      out = forms[language](match, t, known);
      if (out != null) break;
    }
  }
  if (memo.size > 4000) memo.clear();
  memo.set(core, out);
  return out;
}

// ---- DOM translation -------------------------------------------------------------------------------------
let current = 'en';
let observer = null;
let originalTitle = null;
const textSource = new WeakMap(), textShown = new WeakMap();
const attrSource = new WeakMap(), attrShown = new WeakMap();

const skipped = (element) => !element || SKIP_TAGS.has(element.nodeName) || Boolean(element.closest?.('[data-i18n-skip],[translate="no"]'));

function visitText(node) {
  const shown = node.data;
  let source = textSource.get(node);
  if (source === undefined || textShown.get(node) !== shown) { source = shown; textSource.set(node, source); }
  const next = current === 'en' ? source : translate(source, current);
  if (next !== shown) node.data = next;
  textShown.set(node, next);
}

function visitAttribute(element, name) {
  if (!element.hasAttribute(name)) return;
  const shown = element.getAttribute(name);
  const sources = attrSource.get(element) ?? {}, shownBefore = attrShown.get(element) ?? {};
  let source = sources[name];
  if (source === undefined || shownBefore[name] !== shown) source = shown;
  sources[name] = source; attrSource.set(element, sources);
  const next = current === 'en' ? source : translate(source, current);
  if (next !== shown) element.setAttribute(name, next);
  shownBefore[name] = next; attrShown.set(element, shownBefore);
}

function visit(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) visitText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
  for (const name of ATTRIBUTES) visitAttribute(root, name);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeType === Node.ELEMENT_NODE && (SKIP_TAGS.has(node.nodeName) || node.hasAttribute('data-i18n-skip') || node.getAttribute('translate') === 'no')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) visitText(node);
    else for (const name of ATTRIBUTES) visitAttribute(node, name);
  }
}

function onMutations(records) {
  for (const record of records) {
    if (record.type === 'childList') record.addedNodes.forEach(visit);
    else if (record.type === 'characterData') { if (!skipped(record.target.parentElement)) visitText(record.target); }
    else if (record.type === 'attributes' && !skipped(record.target)) visitAttribute(record.target, record.attributeName);
  }
  observer.takeRecords(); // drop the records caused by our own writes
}

function readStoredLanguage() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (LANGUAGES.some((item) => item.id === fromUrl)) return fromUrl;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((item) => item.id === stored)) return stored;
  } catch { /* storage unavailable: fall back to English */ }
  return 'en';
}

export function getLanguage() { return current; }

export function setLanguage(language) {
  if (!LANGUAGES.some((item) => item.id === language)) return;
  current = language;
  try { localStorage.setItem(STORAGE_KEY, language); } catch { /* keep working without storage */ }
  document.documentElement.lang = language;
  if (originalTitle == null) originalTitle = document.title;
  document.title = translate(originalTitle, language);
  visit(document.body);
  observer?.takeRecords();
  updateSwitch(language);
  updateGeneratedTextNotice(language);
  observer?.takeRecords();
  window.dispatchEvent(new CustomEvent('akimlab:language', { detail: { language } }));
}

// The adviser briefing and its voice-over are generated in English by the server, so say so next to those controls.
const GENERATED_NOTICE = {
  kk: 'AI брифингі мен дауыстық оқу әзірге тек ағылшын тілінде.',
  ru: 'AI-брифинг и озвучка пока только на английском.',
};
function updateGeneratedTextNotice(language) {
  const anchor = document.getElementById('adviser-output');
  let note = document.getElementById('i18n-generated-note');
  if (language === 'en' || !anchor?.parentElement) { note?.remove(); return; }
  if (!note) {
    note = document.createElement('p');
    note.id = 'i18n-generated-note'; note.className = 'lang-note'; note.dataset.i18nSkip = '';
    anchor.parentElement.insertBefore(note, anchor);
  }
  note.lang = language;
  note.textContent = GENERATED_NOTICE[language];
}

// One button: it shows the current language, and each click moves to the next one (ҚАЗ → РУС → ENG → ҚАЗ).
function nextLanguage(language) {
  const index = LANGUAGES.findIndex((item) => item.id === language);
  return LANGUAGES[(index + 1) % LANGUAGES.length];
}
function updateSwitch(language) {
  const button = document.querySelector('.lang-switch');
  if (!button) return;
  const item = LANGUAGES.find((entry) => entry.id === language) ?? LANGUAGES[2], next = nextLanguage(language);
  button.querySelector('.lang-current').textContent = item.label;
  button.dataset.lang = item.id;
  button.title = `${item.name} → ${next.name}`;
  button.setAttribute('aria-label', `Тіл · Язык · Language: ${item.name}. → ${next.name}`);
}
function mountSwitch() {
  const style = document.createElement('style');
  style.textContent = `.lang-switch{display:inline-flex;align-items:center;gap:6px;min-height:33px;padding:5px 11px;border:1px solid var(--border,#d9e2d5);border-radius:9px;background:#fff;color:var(--text,#24372b);font:inherit;font-size:12px;font-weight:650;letter-spacing:.03em;cursor:pointer;flex-shrink:0}
.lang-switch:hover{border-color:var(--primary,#2f6f4f);color:var(--primary,#2f6f4f)}
.lang-switch .lang-globe{font-size:14px;line-height:1}
.lang-switch .lang-dots{display:inline-flex;gap:3px;margin-left:2px}
.lang-switch .lang-dots i{width:5px;height:5px;border-radius:50%;background:#cfd8cc}
.lang-switch[data-lang=kk] .lang-dots i:nth-child(1),.lang-switch[data-lang=ru] .lang-dots i:nth-child(2),.lang-switch[data-lang=en] .lang-dots i:nth-child(3){background:var(--primary,#2f6f4f)}
.lang-note{font-size:11px;line-height:1.45;color:var(--muted,#667c68);margin:8px 0 4px}
.lang-switch.floating{position:fixed;top:12px;right:12px;z-index:1000;box-shadow:0 4px 18px #304d3318}
@media(max-width:760px){.lang-switch{min-height:29px;padding:3px 8px;font-size:11px}}`;
  document.head.append(style);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lang-switch';
  button.dataset.i18nSkip = '';
  button.innerHTML = '<span class="lang-globe" aria-hidden="true">🌐</span><span class="lang-current"></span><span class="lang-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  button.addEventListener('click', () => setLanguage(nextLanguage(current).id));
  const host = document.querySelector('.hud-nav') ?? document.querySelector('.hud');
  if (host) host.append(button); else { button.classList.add('floating'); document.body.append(button); }
  updateSwitch(current);
}

function start() {
  if (observer) return;
  mountSwitch();
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  setLanguage(readStoredLanguage());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
