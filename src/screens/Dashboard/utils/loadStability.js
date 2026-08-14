/*
 * Whether a suggestion is worth presenting as a finding, or only as a guess.
 *
 * The detector already measures variability — `stdDevPower` is a first-class
 * feature, weighted 0.25 against meanPower's 0.38, and every generic profile
 * carries a range for it. But it is treated as a feature to *match on*, never as
 * a reason to withhold judgement. So a load that swings does not come back
 * unidentified; it comes back matched to whichever profile tolerates swinging.
 *
 * Observed on hardware. An iPhone charging through its CC-CV taper — roughly
 * 30 W down to 10 W over 38 minutes — was reported as:
 *
 *   Monitor 50% · Speaker 45% · Electric Fan 39% · Laptop Charger 37%
 *
 * Those four are precisely the high-stdDev profiles. Nothing malfunctioned. The
 * mean of a sweep is 21 W, 21 W sits inside Monitor's 14-50 W band, and the
 * model has no way to express "this load is changing, so one name is the wrong
 * kind of answer".
 *
 * Presentation, not detection: it changes how a verdict is shown, never how it
 * is reached. Taken verbatim from the web client, which wrote it without JSX so
 * `node --test` could reach it - the same property that made it a straight copy
 * here. Keep both copies byte-identical; the rendering around it differs, this
 * does not.
 */

// At or above this, the top match reads as a finding rather than a guess.
const CONFIDENT_FLOOR = 60;

// How far the leader must be clear of the runner-up. Four candidates inside 13
// points of each other is the shape the iPhone produced, and it means the
// signature resembles everything a little and nothing much.
const DECISIVE_MARGIN = 10;

// stdDev as a fraction of the mean, above which the load is genuinely moving
// rather than merely noisy. A steady LED lamp sits near 0.04; the iPhone taper
// is near 0.28.
const VARYING_RATIO = 0.15;

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * @param {object} args
 * @param {number|null} args.confidencePercent  The suggested name's score.
 * @param {Array}  args.candidates  `{ name, confidencePercent }`, any order.
 * @param {string} args.suggestedName  Excluded when finding the runner-up.
 * @param {boolean} args.ambiguous  The backend's own flag, which outranks ours.
 * @param {number|null} args.meanPowerW   `features.meanPower`
 * @param {number|null} args.stdDevPowerW `features.stdDevPower`
 * @returns {{ trusted: boolean, reason: string|null, varying: boolean, swingW: number|null }}
 */
export const resolveSuggestionTrust = ({
  confidencePercent,
  candidates,
  suggestedName,
  ambiguous,
  meanPowerW,
  stdDevPowerW,
} = {}) => {
  const mean = toPositiveNumber(meanPowerW);
  const stdDev = toPositiveNumber(stdDevPowerW);

  /*
   * Computed independently of trust, and that separation is the whole design.
   *
   * A laptop charger genuinely varies - its profile allows stdDev up to 30 W -
   * so variability alone must not demote a match. When one scores 85% with a
   * clear lead it is still a finding, and saying "not sure" over it would be
   * false. `varying` is only ever the *explanation* for a weak match, never the
   * trigger for calling one weak.
   */
  const varying = mean > 0 && stdDev / mean >= VARYING_RATIO;
  const swingW = varying ? stdDev : null;

  const untrusted = (reason) => ({ trusted: false, reason, varying, swingW });

  // The backend evaluated the same run against the same profiles. If it already
  // said the result was ambiguous, nothing here should overrule it.
  if (ambiguous === true) return untrusted('ambiguous');

  const top = Number(confidencePercent);
  if (!Number.isFinite(top)) {
    // No score at all is not evidence of a good match.
    return untrusted('weak');
  }

  if (top < CONFIDENT_FLOOR) return untrusted('weak');

  // The runner-up is the best-scoring candidate that is not the suggestion
  // itself. Callers pass the list unfiltered and in no guaranteed order.
  const normalizedTop = String(suggestedName || '').trim().toLowerCase();
  const runnerUp = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => {
      const name = String(candidate?.name || '').trim().toLowerCase();
      return name && name !== normalizedTop;
    })
    .reduce((best, candidate) => {
      const score = Number(candidate?.confidencePercent);
      if (!Number.isFinite(score)) return best;
      return score > best ? score : best;
    }, -Infinity);

  if (Number.isFinite(runnerUp) && top - runnerUp < DECISIVE_MARGIN) {
    return untrusted('indecisive');
  }

  return { trusted: true, reason: null, varying, swingW };
};

/**
 * The sentence shown in place of "This looks like X".
 *
 * `varying` is preferred wherever it applies: it names a cause the user can see
 * for themselves on the wattage readout, where "the scores are close" describes
 * only the model's difficulty and gives them nothing to act on.
 */
export const describeUncertainty = ({ varying, swingW, meanPowerW }) => {
  const mean = toPositiveNumber(meanPowerW);
  const swing = toPositiveNumber(swingW);

  if (varying && mean > 0 && swing > 0) {
    return `This load changes while it runs — around ${mean.toFixed(0)} W on average, swinging about ${swing.toFixed(0)} W either side. The energy is still counted exactly; it is only the name that cannot be pinned down.`;
  }

  return 'The closest matches score within a few points of each other, so each of these is a guess rather than a finding.';
};

export const TRUST_THRESHOLDS = { CONFIDENT_FLOOR, DECISIVE_MARGIN, VARYING_RATIO };
