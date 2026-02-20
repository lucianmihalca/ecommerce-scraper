# ecommerce-scraper

A modular Node.js + TypeScript solution designed to programmatically navigate and
extract structured data from an e-commerce website.

## Overview

This project implements a structured scraping module for an e-commerce platform. It
provides a clean and reusable API that allows:

- Retrieving product listings based on search criteria
- Extracting detailed product information
- Separating navigation and scraping logic into maintainable layers

For this assignment, the selected retailer is **PcComponentes (pccomponentes.com)**.

## Tech Stack

- Node.js (v18+)
- TypeScript
- pnpm _(package manager)_
- Playwright _(to be integrated)_

## Installation

> This project uses **pnpm** as package manager. If you don't have it installed:
> `npm install -g pnpm`

```bash
pnpm install
```

## Project Structure

```
src/
├── models/       # TypeScript interfaces and classes
├── navigator/    # Browser navigation with Playwright
├── scrapers/     # Page-specific scraping logic
└── index.ts      # Main entry point
```

## Status

🚧 In progress
