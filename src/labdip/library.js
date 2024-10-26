/**
 * The dip library.
 *
 * Every dip the lab has ever sent, kept so the next enquiry can start from the
 * closest one rather than from nothing. The search is on the standard the dip
 * was matching, not on the dip itself, because an enquiry arrives as a standard
 * and the whole point is to find work already done against something like it.
 */

import { requireArray, requirePositive, requireText, optional } from '../valid/guards.js';
import { deltaE, formulaNames } from '../colour/deltae.js';
import { requireOneOf } from '../valid/guards.js';

export function createDipLibrary(entries = []) {
  return requireArray(entries, 'entries').map((entry) => ({
    submissionId: requireText(entry.submissionId, 'entry.submissionId', { maxLength: 24 }),
    customer: requireText(entry.customer, 'entry.customer', { maxLength: 80 }),
    standardName: requireText(entry.standardName, 'entry.standardName', { maxLength: 80 }),
    standard: entry.standard,
    substrate: requireText(entry.substrate, 'entry.substrate', { maxLength: 40 }),
    recipeId: optional(entry.recipeId, (v) => requireText(v, 'entry.recipeId'), null),
    rounds: optional(entry.rounds, (v) => requirePositive(v, 'entry.rounds'), 1),
    approved: entry.approved === true,
  }));
}

export function addToLibrary(library, submission) {
  const approvedDip = submission.approvedDip ?? null;
  const entry = {
    submissionId: submission.id,
    customer: submission.customer,
    standardName: submission.standardName,
    standard: submission.standard,
    substrate: submission.substrate,
    recipeId: approvedDip ? approvedDip.recipeId : null,
    rounds: Math.max(1, submission.dips.length),
    approved: submission.outcome === 'approved',
  };
  library.push(entry);
  return entry;
}

/**
 * Find the dips whose standard sits closest to a new one. Approved work sorts
 * ahead of unapproved at the same distance, and a match on the same substrate
 * ahead of one on another, because a recipe that worked on poplin is not a
 * recipe on jersey.
 */
export function search(library, standard, options = {}) {
  const formula = requireOneOf(optional(options.formula, String, 'cmc'), 'formula', formulaNames());
  const limit = requirePositive(optional(options.limit, Number, 5), 'limit');
  const within = requirePositive(optional(options.within, Number, 6), 'within');
  const substrate = options.substrate ?? null;
  const approvedOnly = options.approvedOnly === true;

  return library
    .filter((entry) => !approvedOnly || entry.approved)
    .map((entry) => ({
      ...entry,
      distance: deltaE(formula, standard, entry.standard),
      sameSubstrate: substrate === null ? null : entry.substrate === substrate,
    }))
    .filter((row) => row.distance <= within)
    .sort(
      (a, b) =>
        Number(b.sameSubstrate === true) - Number(a.sameSubstrate === true) ||
        Number(b.approved) - Number(a.approved) ||
        a.distance - b.distance
    )
    .slice(0, limit);
}

/** How many rounds the lab averages, which is the number it is judged on. */
export function averageRounds(library, { customer } = {}) {
  const rows = library.filter((entry) => !customer || entry.customer === customer);
  if (rows.length === 0) return null;
  return rows.reduce((sum, entry) => sum + entry.rounds, 0) / rows.length;
}

/** The share of submissions that ever got approved. */
export function approvalRate(library, { customer } = {}) {
  const rows = library.filter((entry) => !customer || entry.customer === customer);
  if (rows.length === 0) return null;
  return rows.filter((entry) => entry.approved).length / rows.length;
}

/** Standards that came back more than once, which are the ones worth a shelf card. */
export function repeatStandards(library, { formula = 'cmc', within = 0.5 } = {}) {
  const groups = [];
  for (const entry of library) {
    const group = groups.find(
      (candidate) => deltaE(formula, candidate.standard, entry.standard) <= within
    );
    if (group) {
      group.entries.push(entry);
    } else {
      groups.push({ standard: entry.standard, name: entry.standardName, entries: [entry] });
    }
  }
  return groups
    .filter((group) => group.entries.length > 1)
    .map((group) => ({
      name: group.name,
      count: group.entries.length,
      customers: [...new Set(group.entries.map((entry) => entry.customer))],
      recipeIds: [...new Set(group.entries.map((entry) => entry.recipeId).filter(Boolean))],
    }))
    .sort((a, b) => b.count - a.count);
}
