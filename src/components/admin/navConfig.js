// Каталог «стандартных разделов» и раскладка по умолчанию для сайдбара.
//
// SaaS-замысел: набор пунктов (ITEMS) и контейнеров (SECTIONS) — фиксированный
// каталог, единый для всех компаний. Компания не придумывает новые пункты, а лишь
// раскладывает существующие по разделам и меняет порядок (см. lib/navLayout.js —
// слой хранилища раскладки; сейчас localStorage, позже — per-tenant через API).
import {
  LayoutDashboard, Inbox, Shuffle, ClipboardList, ClipboardCheck, PackageCheck, Archive,
  Building2, MapPin, Container, User, Truck, CalendarDays, BarChart3, UserCog, Settings,
  Map, Camera, Layers, Library, ShieldCheck, Star, MessageSquareText, Building,
} from 'lucide-react'

// Каталог пунктов: ключ = маршрут. roles ограничивает видимость по роли.
export const ITEMS = {
  '/':             { label: 'Сводка', Icon: LayoutDashboard, end: true },
  '/reports':      { label: 'Отчёты', Icon: BarChart3 },
  '/incoming':     { label: 'Входящие', Icon: Inbox },
  '/orders':       { label: 'Заявки в работе', Icon: ClipboardList },
  '/distribution': { label: 'Распределение', Icon: Shuffle },
  '/map':          { label: 'Карта смены', Icon: Map },
  '/review':       { label: 'На проверке', Icon: ClipboardCheck },
  '/inwork':       { label: 'В работе', Icon: PackageCheck },
  '/proof-review': { label: 'Проверка пруфов', Icon: Camera, roles: ['manager', 'director', 'superuser'] },
  '/journal':      { label: 'Журнал', Icon: Archive },
  '/clients':      { label: 'Клиенты', Icon: Building2, roles: ['manager', 'director'] },
  '/objects':      { label: 'Объекты', Icon: MapPin },
  '/containers':   { label: 'Контейнеры', Icon: Container },
  '/drivers':      { label: 'Водители', Icon: User },
  '/vehicles':     { label: 'Машины', Icon: Truck },
  '/schedule':     { label: 'График', Icon: CalendarDays },
  '/companies':    { label: 'Клиенты', Icon: Building, roles: ['superuser'] },
  '/users':        { label: 'Пользователи', Icon: UserCog, roles: ['director', 'superuser'] },
  '/templates':    { label: 'Шаблоны', Icon: MessageSquareText, roles: ['manager', 'director', 'superuser'] },
  '/settings':     { label: 'Настройки', Icon: Settings, roles: ['manager', 'director', 'superuser'] },
}

// Контейнеры (основные разделы). `main` — псевдораздел: его пункты выводятся
// как обычные ссылки верхнего уровня (без аккордеона). `bottom` прижимает к низу.
export const SECTIONS = {
  main:    { label: 'Основные', Icon: Star },
  orders:  { label: 'Заявки', Icon: Layers },
  refs:    { label: 'Справочник', Icon: Library },
  reports: { label: 'Отчёты', Icon: BarChart3 },
  system:  { label: 'Система', Icon: ShieldCheck },
}

// Порядок контейнеров в сайдбаре (сам порядок разделов в v1 не перетаскивается).
export const CONTAINER_ORDER = ['main', 'orders', 'refs', 'reports', 'system']

// Раскладка по умолчанию: какой пункт в каком контейнере и в каком порядке.
export const DEFAULT_LAYOUT = {
  main:    [],
  orders:  ['/incoming', '/orders', '/distribution', '/map', '/review', '/inwork', '/proof-review', '/journal'],
  refs:    ['/clients', '/objects', '/containers', '/drivers', '/vehicles', '/schedule'],
  reports: ['/', '/reports'],
  system:  ['/companies', '/users', '/templates', '/settings'],
}

export const isValidKey = (k) => Object.prototype.hasOwnProperty.call(ITEMS, k)
