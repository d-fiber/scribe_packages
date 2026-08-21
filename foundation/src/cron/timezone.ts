// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

/**
 * The time zones a calendar schedule may be placed in.
 *
 * A closed list rather than a free string: a zone name croner does not know produces a job
 * that never fires, and nothing would say so at declaration.
 */
export enum CronTimezone {
  Utc = "UTC",
  EuropeLondon = "Europe/London",
  EuropeDublin = "Europe/Dublin",
  EuropeLisbon = "Europe/Lisbon",
  EuropeParis = "Europe/Paris",
  EuropeMadrid = "Europe/Madrid",
  EuropeBrussels = "Europe/Brussels",
  EuropeAmsterdam = "Europe/Amsterdam",
  EuropeBerlin = "Europe/Berlin",
  EuropeZurich = "Europe/Zurich",
  EuropeRome = "Europe/Rome",
  EuropeVienna = "Europe/Vienna",
  EuropeWarsaw = "Europe/Warsaw",
  EuropePrague = "Europe/Prague",
  EuropeBudapest = "Europe/Budapest",
  EuropeStockholm = "Europe/Stockholm",
  EuropeOslo = "Europe/Oslo",
  EuropeCopenhagen = "Europe/Copenhagen",
  EuropeHelsinki = "Europe/Helsinki",
  EuropeAthens = "Europe/Athens",
  EuropeBucharest = "Europe/Bucharest",
  EuropeIstanbul = "Europe/Istanbul",
  EuropeMoscow = "Europe/Moscow",
  EuropeKyiv = "Europe/Kyiv",
  AfricaCasablanca = "Africa/Casablanca",
  AfricaAlgiers = "Africa/Algiers",
  AfricaTunis = "Africa/Tunis",
  AfricaCairo = "Africa/Cairo",
  AfricaLagos = "Africa/Lagos",
  AfricaNairobi = "Africa/Nairobi",
  AfricaJohannesburg = "Africa/Johannesburg",
  AmericaNewYork = "America/New_York",
  AmericaChicago = "America/Chicago",
  AmericaDenver = "America/Denver",
  AmericaLosAngeles = "America/Los_Angeles",
  AmericaAnchorage = "America/Anchorage",
  AmericaToronto = "America/Toronto",
  AmericaVancouver = "America/Vancouver",
  AmericaMexicoCity = "America/Mexico_City",
  AmericaBogota = "America/Bogota",
  AmericaLima = "America/Lima",
  AmericaSantiago = "America/Santiago",
  AmericaSaoPaulo = "America/Sao_Paulo",
  AmericaBuenosAires = "America/Argentina/Buenos_Aires",
  AsiaDubai = "Asia/Dubai",
  AsiaJerusalem = "Asia/Jerusalem",
  AsiaRiyadh = "Asia/Riyadh",
  AsiaKarachi = "Asia/Karachi",
  AsiaKolkata = "Asia/Kolkata",
  AsiaDhaka = "Asia/Dhaka",
  AsiaBangkok = "Asia/Bangkok",
  AsiaJakarta = "Asia/Jakarta",
  AsiaSingapore = "Asia/Singapore",
  AsiaHongKong = "Asia/Hong_Kong",
  AsiaShanghai = "Asia/Shanghai",
  AsiaTaipei = "Asia/Taipei",
  AsiaSeoul = "Asia/Seoul",
  AsiaTokyo = "Asia/Tokyo",
  AsiaManila = "Asia/Manila",
  AustraliaPerth = "Australia/Perth",
  AustraliaBrisbane = "Australia/Brisbane",
  AustraliaSydney = "Australia/Sydney",
  AustraliaMelbourne = "Australia/Melbourne",
  PacificAuckland = "Pacific/Auckland",
}
