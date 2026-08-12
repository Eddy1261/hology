AI CONNECT — Frontend PRD
1. Product Overview

Product name: AI CONNECT

Product type: Desktop companion application for managing AI ↔ MCP ↔ application connections.

AI CONNECT provides a compact control interface for users to:

authenticate their account
manage subscription
connect MCP servers/apps
manage AI sessions
browse available MCP integrations
manage AI skills / Markdown-based skill definitions
configure account and connection settings
access help and FAQs

The application runs on desktop but deliberately uses a 398 × 675 px viewport so it behaves visually like a sidebar/compact utility application.

The UI should feel:

technical
modern
lightweight
trustworthy
slightly futuristic
production-grade
not overly "AI gimmicky"

Primary visual identity is based on the existing AI CONNECT logo and its blue-on-dark aesthetic.

2. Core Design Constraint
Fixed Application Canvas

Target:

Width: 398px
Height: 675px

The application should not expand into a normal desktop dashboard.

Think:

┌──────────────────────────────┐
│                              │
│         AI CONNECT           │
│                              │
│  compact desktop companion   │
│                              │
│  398 × 675                   │
│                              │
└──────────────────────────────┘

It should feel similar to:

VPN clients
password managers
developer utilities
Raycast-like utility panels
compact desktop control centers

The UI must remain usable at the target dimension.

Avoid designing large desktop layouts, wide tables, huge cards, or excessive whitespace.

3. Application Information Architecture

The application should contain these primary pages:

AI CONNECT
│
├── Landing
│
├── Authentication
│   ├── Login
│   └── Sign Up
│       └── Plan Selection
│
├── Payment
│
├── Main / Dashboard
│
├── Session
│
├── MCP Collection
│
├── Skill Management
│
├── Help / FAQ
│
└── Settings
    ├── Account
    ├── Email Connection
    └── Subscription
4. Navigation Model

Because the viewport is only 398 × 675, do not use a persistent desktop sidebar.

Use a compact top navigation:

☰        AI CONNECT        ?

The hamburger opens a compact navigation drawer/menu.

Navigation items:

Home
Sessions
MCP Collection
Skills
Help
Settings

Bottom of navigation:

Account
Subscription
Sign Out

The navigation should feel lightweight and should not consume the entire screen.

5. Page Specifications
PAGE 01 — Landing
Purpose

First-time introduction to AI CONNECT.

Content

Hero:

Your AI.
Connected to Everything.

Supporting copy:

Connect AI agents to external applications, tools, and data through MCP.

Primary CTA:

Get Started

Secondary CTA:

Sign In

Visual:

Use the AI CONNECT logo/character identity.

The robot/character can become a recurring brand element throughout the application, but do not overuse it.

States
first visit
authenticated user redirect
already subscribed user redirect
PAGE 02 — Login
Content
Welcome back.

Email
[________________]

Password
[________________]

[ Sign In ]

Forgot password?

Alternative authentication can be added later.

Bottom:

Don't have an account?
Create account
Requirements
validation
loading state
incorrect credentials state
network error state
disabled submit state
PAGE 03 — Sign Up + Package Selection

Do not make registration and pricing feel like two completely disconnected pages.

Flow:

Create account
      ↓
Choose plan
      ↓
Payment
      ↓
Account created
Signup
Create your AI CONNECT account

Email
Password
Confirm Password

[ Continue ]
Package Selection

Example structure:

Choose your plan

FREE
$0
Basic MCP connections

PRO
$X / month
More connections
More sessions
Priority features

[ Choose Pro ]

The actual pricing should be treated as configurable data rather than hardcoded UI.

Important

The frontend must support:

monthly plans
potentially yearly plans later
active plan
selected plan
unavailable plan
loading state
PAGE 04 — Payment

Payment page should be intentionally simple because of the 398px width.

Complete your subscription

PRO
$XX / month

────────────────

Email
user@email.com

Payment method

[ payment UI ]

────────────────

Total
$XX

[ Subscribe ]

Include:

payment loading
payment success
payment failure
cancelled payment
retry payment

Do not attempt to build a complicated desktop checkout.

Payment provider integration should be abstracted behind a frontend service/API layer.

PAGE 05 — MAIN / HOME

This is the current design and should become the primary production page.

The uploaded design is the visual source of truth.

Header
☰        AI CONNECT        ?
Hero

Compact hero area:

Your AI.
Connected to Everything.

Supporting text.

CTA:

+ Add MCP Server

Character illustration on the right.

Connected Servers

Example:

CONNECTED SERVERS       1 Active

┌────────────────────────────┐
│ Revit Desk                 │
│ ● Connected        [ ON ]  │
│                            │
│ BIM Modeling               │
│ localhost:3001             │
└────────────────────────────┘
Available MCP Apps

Scrollable list:

Excel MCP
Data Analysis             Connect

AutoCAD MCP
CAD Design                Connect

PowerBI MCP
Data Visualization       Connect

Postgres MCP
Database                  Connect

Shell MCP
Command Line             Connect
Custom MCP
+ Add Custom MCP Server
Connect to your own MCP server
Footer/status
● All systems operational
PAGE 06 — SESSION

This page needs to be designed around the actual purpose of AI CONNECT.

A session represents an active AI ↔ MCP interaction.

Example:

SESSION

Revit Desk
● Connected

Session #4821

────────────────

AI
Connected

MCP
Revit Desk

Tools
12 available

────────────────

Activity

10:42  get_project_info
10:43  get_active_view
10:43  query_elements

────────────────

[ End Session ]

Potential states:

No active session
No active session

Connect an MCP server to start
a session.

[ Browse MCP Apps ]
Active session

Show:

connected MCP
session duration
available tools
recent activity
connection status
Error
Session interrupted

The connection to Revit Desk
was lost.

[ Reconnect ]

This page should be designed for observability, not for executing AI conversations.

PAGE 07 — MCP COLLECTION

Purpose: discover available MCP integrations.

Think of this as the app store/catalog for MCP.

Header:

MCP COLLECTION

Search:

🔍 Search MCP apps

Categories:

All
Productivity
Design
Database
Development
Data

Cards:

┌────────────────────────────┐
│ R  Revit MCP               │
│    BIM & Architecture      │
│                            │
│    ● Available             │
│                   [ Add ]  │
└────────────────────────────┘

Each MCP should support:

icon
name
description
category
connection status
install/connect action
details action
PAGE 08 — SKILL MANAGEMENT

This is specifically for the user's Markdown-based skill collection.

Treat skills differently from MCP servers.

MCP:

connects AI to external capabilities.

Skills:

give the AI reusable behavioral/instructional knowledge.

Header:

SKILLS

Search:

🔍 Search skills

Example:

Revit Modeling
.md
Updated 2h ago

Architecture Analysis
.md
Updated yesterday

Indonesian Legal Research
.md
Updated Aug 10

Skill detail:

REVIT MODELING

Description
...

Source
revit-modeling.md

Updated
Aug 10, 2026

Status
● Enabled

[ Edit ]
[ Disable ]

Because these are Markdown-based, provide:

view
edit
enable/disable
delete
upload/import
create new skill

Potential future feature:

+ Create Skill
PAGE 09 — HELP / FAQ

Keep this extremely clean.

HELP

Search help
[ 🔍 ]

Frequently Asked Questions

▸ What is MCP?

▸ How do I connect an MCP server?

▸ Why is my server offline?

▸ How do sessions work?

▸ How do I manage my subscription?

▸ How do I add a custom MCP?

▸ What are Skills?

FAQ items should expand inline rather than navigate to another page.

Bottom:

Still need help?

Contact Support
PAGE 10 — SETTINGS

Settings should be organized into sections rather than one giant form.

SETTINGS

ACCOUNT
────────────────
Email
user@email.com

[ Manage Account ]


EMAIL CONNECTION
────────────────
Connected Email
● Connected

[ Manage Connection ]


SUBSCRIPTION
────────────────
Pro Plan

● Active

23 days remaining

[ Manage Subscription ]


APPLICATION
────────────────
Notifications       >
Appearance          >
About AI CONNECT   >
Subscription

Clearly show:

PRO

Renews:
Aug 31, 2026

Remaining:
23 days

If expired:

Subscription expired

[ Renew Plan ]
6. Design System
Colors

Use the existing logo as the visual reference.

Background

Very dark charcoal / near-black.

Primary

AI CONNECT blue.

Use blue for:

CTA
active navigation
links
selected states
toggles
connection indicators
logo accent
Status

Green:

Connected
Healthy
Active

Red:

Disconnected
Error
Failed

Amber:

Warning
Expiring

Do not introduce lots of additional colors.

7. Typography

Use a modern sans-serif.

Recommended:

Inter

Hierarchy:

Page title
20–24px

Section title
14–16px

Card title
14–16px

Body
12–14px

Metadata
11–12px

Because the screen is only 398px wide, typographic hierarchy must be compact.

8. Components

Create reusable components rather than implementing every page independently.

Required components:

AppShell
TopBar
NavigationDrawer

Button
IconButton
Toggle
Badge
StatusIndicator

Card
ServerCard
MCPCard
SkillCard

SearchBar
CategoryTabs

Modal
Drawer
Toast
Tooltip

LoadingState
EmptyState
ErrorState

ConfirmDialog
9. Application States

Every data-driven page must support:

Loading

Skeleton rather than blank page.

Empty

Example:

No MCP servers connected.

Connect your first MCP server
to get started.

[ Browse MCP Collection ]
Error
Something went wrong.

[ Try Again ]
Offline
● Offline

Unable to reach AI CONNECT services.
Success

Use lightweight toast notifications.

Example:

✓ Revit Desk connected
10. MCP Connection UX

This is one of the most important flows in the application.

Flow:

MCP Collection
      ↓
Select MCP
      ↓
MCP Details
      ↓
Connect
      ↓
Connection Setup
      ↓
Connecting...
      ↓
Connected
      ↓
Main Dashboard

Connection states:

Not Connected
Connecting
Connected
Disconnected
Error

Never rely solely on color to communicate status.

Use:

● Connected

rather than only a green dot.

11. Custom MCP Server Flow

When user presses:

Add Custom MCP Server

Open a modal/drawer:

ADD MCP SERVER

Server Name
[________________]

Endpoint
[________________]

Transport
○ HTTP
○ SSE
○ STDIO

[ Test Connection ]

[ Cancel ] [ Add Server ]

After testing:

✓ Connection successful

or:

✕ Unable to connect
Check endpoint and server status.
12. Desktop Behavior

Although the UI is fixed at:

398 × 675

the implementation should still handle slightly different window sizes gracefully.

Preferred behavior:

minimum width: 360px
target width: 398px
maximum width: 430px

Height should allow scrolling.

Do not stretch cards horizontally to fill arbitrary desktop screens.

The visual identity depends on maintaining the compact utility-app feeling.

13. UX Principles
1. Connection status is always obvious

The user should immediately understand:

"What is connected right now?"

2. Actions should be one or two clicks away

Example:

MCP Collection → Connect

not:

MCP Collection → Details → Configuration → Settings → Connection → Connect
3. Don't overload the screen

398px is tiny.

Prefer:

Card
Card
Card

over dense tables.

4. Preserve context

When opening:

MCP details
session details
skill details
settings

prefer a drawer/modal where appropriate instead of constantly navigating away.

5. Character is branding, not decoration

The robot character introduced in the design should be used selectively:

Landing hero
Empty states
Connection success
Possibly onboarding

Avoid putting the character on every page.

14. Frontend Architecture

The frontend should be built as a production application rather than a static mockup.

Recommended structure:

src/
├── app/
│   ├── routes/
│   ├── layouts/
│   └── providers/
│
├── components/
│   ├── ui/
│   ├── navigation/
│   ├── mcp/
│   ├── sessions/
│   ├── skills/
│   └── account/
│
├── pages/
│   ├── Landing
│   ├── Login
│   ├── Signup
│   ├── Payment
│   ├── Dashboard
│   ├── Session
│   ├── MCPCollection
│   ├── Skills
│   ├── Help
│   └── Settings
│
├── services/
│   ├── auth
│   ├── mcp
│   ├── sessions
│   ├── skills
│   ├── payment
│   └── account
│
├── hooks/
├── stores/
├── types/
├── utils/
└── assets/

Use mock services/interfaces if backend APIs are not yet available.

Do not hardcode backend behavior into UI components.

15. Data Models

Frontend should define types/interfaces for at least:

User
Subscription
Plan
MCPServer
MCPApp
MCPConnection
Session
SessionEvent
Skill
FAQItem

Example:

MCPServer {
  id
  name
  description
  version
  endpoint
  status
  capabilities[]
  lastConnectedAt
}
16. Routing

Suggested routes:

/
 /login
 /signup
 /payment

 /app
 /app/session/:id
 /app/mcp
 /app/mcp/:id
 /app/skills
 /app/skills/:id
 /app/help
 /app/settings

Authenticated routes must be protected.

Unauthenticated users attempting to access /app/* should be redirected to /login.

17. Production Requirements

The frontend must include:

proper loading states
error handling
form validation
authenticated route protection
API abstraction
reusable components
responsive behavior within the compact viewport
keyboard accessibility
accessible buttons and labels
toast notifications
confirmation dialogs for destructive actions
persistent authentication state
proper empty states
proper disconnected/offline states

Avoid:

placeholder lorem ipsum
giant fake dashboards
hardcoded connection states everywhere
duplicated components
inline API calls
unnecessary animations
excessive gradients
excessive glassmorphism
Implementation Subtasks

Give the agent these as implementation phases.

Phase 1 — Foundation
FE-001 — Initialize application shell
Set up frontend project
Configure routing
Configure global styles
Configure 398×675 target viewport
Create application shell
FE-002 — Implement design tokens
Colors
Typography
Spacing
Border radius
Shadows
Status colors
Button styles
FE-003 — Build reusable UI primitives
Button
IconButton
Card
Badge
Toggle
Input
Search
Modal
Drawer
Toast
Loading
Empty state
Error state
Phase 2 — Navigation
FE-004 — Top navigation

Implement:

☰ AI CONNECT ?
FE-005 — Navigation drawer

Implement:

Home
Sessions
MCP Collection
Skills
Help
Settings

Include account/sign-out section.

Phase 3 — Authentication
FE-006 — Landing page

Implement the AI CONNECT brand introduction.

FE-007 — Login

Implement:

email
password
validation
loading
error
success
FE-008 — Signup

Implement account creation.

FE-009 — Plan selection

Implement subscription cards and selected state.

FE-010 — Payment

Implement payment UI abstraction and all payment states.

Phase 4 — Main Dashboard
FE-011 — Implement dashboard based on provided reference image

This should use the uploaded design as the primary visual reference.

Implement:

header
hero
character
connected server
MCP app list
custom MCP CTA
system status
footer
FE-012 — Connected server card

Implement:

app icon
server name
version
connection state
health
endpoint
uptime
toggle
overflow menu
FE-013 — MCP app cards

Implement reusable MCP card.

States:

Connect
Connecting
Connected
Disconnected
Error
Phase 5 — MCP
FE-014 — MCP Collection

Implement:

search
category filtering
MCP cards
connection state
FE-015 — MCP Details

Implement:

icon
description
capabilities
requirements
connection state
connect button
FE-016 — Custom MCP

Implement:

endpoint configuration
transport selection
connection test
validation
add server
Phase 6 — Sessions
FE-017 — Session list

Show active/recent sessions.

FE-018 — Session detail

Show:

MCP
status
duration
available tools
activity
errors
end session
FE-019 — Session states

Implement:

Connecting
Active
Disconnected
Failed
Ended
Phase 7 — Skills
FE-020 — Skill collection

Implement Markdown skill listing.

FE-021 — Skill detail

Implement:

metadata
content preview
status
enable/disable
FE-022 — Skill editor

Implement Markdown editing.

FE-023 — Skill import/create/delete

Implement:

create
upload
edit
delete
enable
disable
Phase 8 — Help
FE-024 — FAQ page

Implement:

search
categories
expandable FAQ
support CTA
Phase 9 — Settings
FE-025 — Account settings
FE-026 — Email connection
FE-027 — Subscription status

Display:

Plan
Status
Renewal date
Time remaining
FE-028 — Application settings

Include:

notifications
appearance
about
sign out
Phase 10 — Production Polish
FE-029 — Loading states

Every API-driven component must have a loading state.

FE-030 — Empty states

Every collection must have an empty state.

FE-031 — Error states

Every API interaction must handle errors.

FE-032 — Offline state

Detect backend/service connectivity failure.

FE-033 — Accessibility

Keyboard navigation, focus states, labels, contrast.

FE-034 — Animation

Add subtle animations only where they improve UX:

page transitions
drawer
modal
connection state
toast
loading
FE-035 — Final visual QA

Test at:

360 × 675
398 × 675
430 × 675

Primary target:

398 × 675
Definition of Done

The frontend is considered complete when:

 All defined routes exist
 Authentication flow works
 Subscription flow has complete UI states
 Dashboard matches the supplied design direction
 AI CONNECT branding is consistent
 Blue/black visual identity is consistent
 MCP collection works with mocked/API data
 MCP connection states are represented
 Custom MCP flow exists
 Session page exists
 Skill management exists
 Help/FAQ exists
 Settings exists
 All collections have loading/empty/error states
 Navigation works
 Application stays visually compact
 UI is optimized for 398 × 675
 No major page requires horizontal scrolling
 No placeholder content remains
 No duplicated UI implementation where reusable components should exist
 Backend integration points are isolated from presentation components