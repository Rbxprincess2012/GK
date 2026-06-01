# SYSTEM_ARCHITECTURE.md

# AI Waste Management Platform
## Enterprise SaaS Architecture Specification

Version: 1.0
Status: Master Architecture Document
Target: Claude Code / Senior Engineering Teams

---

# 1. PRODUCT VISION

The goal is to build a production-ready AI-first SaaS platform for waste management and dumpster/container companies.

The platform automates:

- incoming customer requests
- voice message processing
- AI order extraction
- dispatcher workflows
- driver coordination
- route management
- operational analytics
- billing and subscriptions
- messenger communication

This platform is NOT a simple CRM.

This platform is:

# "AI Operating System for Waste Management Companies"

The platform should eventually become the central operational layer for waste management businesses.

---

# 2. PRIMARY DIFFERENTIATOR

The main competitive advantage:

## AI-powered order intake through messengers.

Customers communicate naturally:

- voice messages
- text messages
- photos
- location sharing

AI converts unstructured communication into structured operational data.

Example:

Incoming message:

"Нужен контейнер 8 кубов завтра на Северную 25 после обеда"

AI extracts:

```json
{
  "service_type": "container_installation",
  "container_size": 8,
  "address": "Краснодар, Северная 25",
  "date": "2026-05-17",
  "time_window": "afternoon"
}
```

The customer confirms the order.

The order enters the operational pipeline automatically.

---

# 3. BUSINESS MODEL

The platform is sold as SaaS.

---

# 4. PRICING STRATEGY

## START
Entry-level plan.

Target:
- small businesses
- low operational volume

Includes:
- MAX Messenger bot
- basic AI order intake
- voice transcription
- limited order count
- limited employees
- basic dashboard

Restrictions:
- limited drivers
- limited vehicles
- no advanced routing
- no analytics
- no API access

---

## BUSINESS
Main commercial plan.

Includes:
- MAX Messenger
- Telegram
- WhatsApp
- dispatcher dashboard
- driver workflows
- CRM
- AI extraction
- analytics
- notifications
- operational reporting
- route management

---

## PRO / AI DISPATCH
Premium enterprise plan.

Includes:
- AI route optimization
- Yandex Routing integration
- automation rules
- white-label messenger bots
- custom workflows
- advanced analytics
- API access
- integrations
- enterprise onboarding

---

# 5. MONETIZATION STRATEGY

Revenue sources:

- monthly subscriptions
- AI processing usage
- route optimization usage
- premium modules
- white-label setup fees
- custom integrations
- enterprise onboarding
- support plans

The architecture MUST support:

- usage-based pricing
- feature flags
- tenant-based modules
- metering
- quotas
- billing automation

---

# 6. PRIMARY COMMUNICATION CHANNELS

## MAX Messenger (PRIMARY)

Expected:
- ~80% of incoming requests

The architecture MUST prioritize:

- MAX bot reliability
- MAX webhook processing
- MAX authentication
- MAX message delivery
- MAX conversation state

---

## Secondary Channels

- Telegram
- WhatsApp

---

# 7. CORE PRODUCT PRINCIPLES

The platform MUST be:

- AI-first
- messenger-first
- mobile-first
- automation-first
- multi-tenant
- event-driven internally
- scalable
- modular
- configurable
- provider-agnostic

---

# 8. CRITICAL ENGINEERING PRINCIPLES

## DO NOT BUILD

- tightly coupled messenger logic
- hardcoded workflows
- single-company architecture
- microservices too early
- synchronous AI processing
- direct AI-to-database writes
- provider-dependent architecture

---

## MUST HAVE

- modular monolith architecture
- event-driven internal communication
- queue-based processing
- centralized conversation engine
- provider abstraction layers
- tenant isolation
- audit logging
- observability
- scalable async processing

---

# END OF DOCUMENT
