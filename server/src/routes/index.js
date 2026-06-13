import { Router } from 'express'
import { db } from '../db.js'
import health from './health.js'
import refs from './refs.js'
import objects from './objects.js'
import shifts from './shifts.js'
import orders from './orders.js'
import drafts from './drafts.js'
import channels from './channels.js'
import inbound from './inbound.js'
import outbox from './outbox.js'
import auth from './auth.js'
import usersRoutes from './users.js'
import companiesRoutes from './companies.js'
import emailOutbox from './emailOutbox.js'
import settings from './settings.js'
import distribution from './distribution.js'
import dailyRoutes from './dailyRoutes.js'
import proofReview from './proofReview.js'
import clientMessages from './clientMessages.js'
import clientRecipients from './clientRecipients.js'
import { authenticate, requireUserOrService, requireRole } from '../middleware/authUser.js'
import { createInvoice, updateInvoice } from '../validators/invoice.js'
import { crudRouter } from '../lib/crudRouter.js'
import { createClient, updateClient } from '../validators/client.js'
import { createVehicle, updateVehicle } from '../validators/vehicle.js'
import { createDriver, updateDriver } from '../validators/driver.js'
import { createContainerType, updateContainerType } from '../validators/containerType.js'
import { createContainer, updateContainer } from '../validators/container.js'
import { createSection, updateSection } from '../validators/section.js'
import { createCompanyGroup, updateCompanyGroup } from '../validators/companyGroup.js'
import trustedPersons from './trustedPersons.js'
import { trustedPersonsAgg, sectionsAgg } from '../services/objects.js'

const api = Router()
api.use(health)            // публично

api.use(authenticate)      // читает JWT/сервисный токен → req.auth
api.use('/auth', auth)     // /auth/login публичен; /auth/me под входом внутри

api.use(requireUserOrService) // всё ниже — только под входом (или сервисным токеном n8n)

// Управление пользователями и токенами — директор/суперюзер
api.use('/users', requireRole('director', 'superuser'), usersRoutes)
// Компании-клиенты SaaS — только суперпользователь
api.use('/companies', requireRole('superuser'), companiesRoutes)
api.use('/email-outbox', requireRole('director', 'superuser'), emailOutbox)
api.use('/settings', requireRole('manager', 'director', 'superuser'), settings)
api.use('/distribution', requireRole('manager', 'director', 'superuser'), distribution)
// Проверка пруфов: accept/reject под-задач + очередь (роль проверяется внутри роутера).
api.use(proofReview)
api.use(clientRecipients)
// Сообщение клиенту: сборка текста + диплинк + лог (роль внутри роутера).
api.use(clientMessages)

api.use(refs)

// вложенные объекты клиента — регистрируем до /clients
api.get('/clients/:id/objects', async (req, res, next) => {
  try {
    res.json(await db('objects as o')
      .leftJoin('streets as s', 's.id', 'o.street_id')
      .leftJoin('districts as d', 'd.id', 'o.district_id')
      .where({ 'o.client_id': Number(req.params.id) })
      .select('o.*', 's.name as street_name', 'd.name as district', 'd.alias as district_alias', trustedPersonsAgg('o'), sectionsAgg('o'))
      .orderBy('o.id'))
  } catch (e) { next(e) }
})

api.use('/company-groups', crudRouter('company_groups', {
  createSchema: createCompanyGroup, updateSchema: updateCompanyGroup,
}))
// Водитель: личная ссылка привязки бота — до crudRouter('drivers')
api.post('/drivers/:id/bot-link', requireRole('manager', 'director', 'superuser'), async (req, res, next) => {
  try {
    const { issueLink } = await import('../services/driverAuth.js')
    res.json(await issueLink(Number(req.params.id)))
  } catch (e) { next(e) }
})

api.use('/clients', crudRouter('clients', { createSchema: createClient, updateSchema: updateClient }))
api.use('/vehicles', crudRouter('vehicles', { createSchema: createVehicle, updateSchema: updateVehicle }))
api.use('/drivers', crudRouter('drivers', { createSchema: createDriver, updateSchema: updateDriver }))
api.use('/trusted-persons', trustedPersons)
api.use('/sections', crudRouter('sections', {
  createSchema: createSection, updateSchema: updateSection, allowedFilters: ['object_id'],
}))
api.use('/container-types', crudRouter('container_types', {
  createSchema: createContainerType, updateSchema: updateContainerType,
}))
// обогащённый список контейнеров (тип + объект + клиент) — до crudRouter
api.get('/containers', async (req, res, next) => {
  try {
    let q = db('containers as c')
      .join('container_types as t', 't.id', 'c.type_id')
      .leftJoin('objects as o', 'o.id', 'c.object_id')
      .leftJoin('clients as cl', 'cl.id', 'o.client_id')
      .select(
        'c.*', 't.name as type_name',
        'o.informal_name as object_name', 'o.house as object_house',
        'cl.nickname as client_nickname', 'cl.legal_name as client_legal_name',
      )
      .orderBy('c.number')
    for (const f of ['object_id', 'location', 'state', 'type_id']) {
      if (req.query[f] !== undefined) q = q.where(`c.${f}`, req.query[f])
    }
    res.json(await q)
  } catch (e) { next(e) }
})
api.use('/containers', crudRouter('containers', {
  createSchema: createContainer, updateSchema: updateContainer,
  allowedFilters: ['object_id', 'location'],
}))
api.use('/objects', objects)
api.use('/shifts', shifts)
api.use('/orders', orders)
api.use('/drafts', drafts)
api.use('/channels', channels)
api.use('/inbound', inbound)
api.use('/outbox', outbox)
api.use('/routes', dailyRoutes)
api.use('/invoices', crudRouter('invoices', {
  createSchema: createInvoice, updateSchema: updateInvoice, allowedFilters: ['client_id', 'status'],
}))

export default api
