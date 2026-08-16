/**
 * Help Center content.
 *
 * Written to answer the questions a new user actually asks, in the order they
 * hit them: "what are these blocks?", "why does my charger not get recognised?",
 * "will this match my real bill?".
 *
 * The rule for every answer here is that it states the limitation as plainly as
 * the capability. A help page that only says what works teaches the user to
 * distrust the whole app the first time something does not - and the two things
 * this system is least able to do (name a load that changes while it runs, and
 * predict a whole-house bill from two outlets) are both things a user will meet
 * within a day of installing it.
 *
 * Kept as data rather than JSX so the same content can be lifted to the web app,
 * which asks the same questions of the same backend.
 */

export const HELP_SECTIONS = [
  {
    id: 'bill',
    title: 'Your bill and PELCO III rates',
    icon: '🧾',
    topics: [
      {
        id: 'blocks',
        question: 'What are the three blocks on my bill?',
        answer: [
          'A PELCO III residential bill is built from three groups of charges, and WattWise reproduces all three over the energy it measured.',
          'Block 1 - Generation & Transmission is the cost of producing and moving the electricity. It changes every month, which is why it is the one block you enter yourself.',
          'Block 2 - Distribution is what it costs to deliver power through the local network. These are ERC-approved rates and they are the same for every residential customer, so they are built into the app.',
          'Block 3 - Government charges are universal charges set nationally, plus 12% VAT. Also the same for everyone, also built in.',
          'Only Block 1 is yours to fill in. The other two are not hidden from you - every line and its rate is listed in the Analytics breakdown so you can check them against your bill.',
        ],
      },
      {
        id: 'why-enter',
        question: 'Why do I have to type in the Generation rate myself?',
        answer: [
          'Because it moves. The generation rate is re-computed monthly and published by PELCO III, so no figure hard-coded into an app would stay correct for long.',
          'Blocks 2 and 3 are the opposite: they change rarely, by regulatory ruling, and identically for every customer. Asking you to type those in would add work and a way to get them wrong, without making them any more accurate.',
          'Every bill WattWise produces prints which rate set it used and the date those rates took effect, so you can always tell what a given figure was calculated from.',
        ],
      },
      {
        id: 'which-rates',
        question: 'Which rates do I actually need to fill in?',
        answer: [
          'In a normal month, four: Generation, Gen. Rate Adj, Transmission, and System Loss. Copy them from your latest bill or from the PELCO III rates page.',
          'The other seven fields - Trans. Cost Adj, Ancillary, System Loss Adj, Trans. Demand, Trans. Demand Adj, ICERA and GRAM - are usually zero. Leave them at zero unless your bill shows a figure for them.',
          'Gen. Rate Adj is often a negative number. That is normal and not a mistake; enter it exactly as printed, minus sign included.',
        ],
      },
      {
        id: 'accuracy',
        question: 'How close will this be to the bill that arrives?',
        answer: [
          'For the energy it measures, very close. The energy figure comes from the meter inside your WattWise unit, not from an estimate, and Blocks 1 and 2 are exact arithmetic on rates you can verify line by line.',
          'There is one approximation in the whole model. The VAT applied to generation and transmission is not published as a formula by PELCO III, so it is a factor fitted against real bills - it lands within about a peso on the samples it was checked against.',
          'The much bigger difference is scope, and it is not an error. WattWise measures two outlets. Your bill covers your entire connection - lights, aircon, refrigerator, every socket in the room. Unless everything you use runs through these two outlets, the WattWise total will be lower than your bill, and it should be.',
          'Treat this as "what these two outlets cost", not "what I will be charged". Compare Usage is the screen for checking a real bill against what WattWise saw.',
        ],
      },
      {
        id: 'metering-flat',
        question: 'Why does the ₱5.00 metering charge appear only sometimes?',
        answer: [
          'It is charged once per billing period, not per day. A 10-day period pays ₱5.00 and so does a 45-day one.',
          'So it is included in a full-period bill, but deliberately left out of daily and running totals. If it were added to every partial view, a month of daily figures would add up to far more than the month actually costs.',
        ],
      },
    ],
  },
  {
    id: 'appliances',
    title: 'How WattWise identifies appliances',
    icon: '🔌',
    topics: [
      {
        id: 'steady-vs-changing',
        question: 'Why does it recognise my fan but not my phone charger?',
        answer: [
          'Because a fan holds one level and a charger does not.',
          'WattWise identifies an appliance by how it draws power - the average, how much it swings, how long it runs. An electric fan on one speed sits near a steady wattage for its whole run, which produces a clear, repeatable signature.',
          'A phone charger sweeps. Lithium batteries are charged by drawing hard while the battery fills, then tapering as it approaches full, then settling to almost nothing. One run can move from 30 W down to 3 W. The average of that sweep is a number the charger never actually draws, and several different appliance profiles will each fit it about equally well.',
          'This is a property of the measurement, not a fault. Steady loads identify reliably. Loads that change while they run do not, and no amount of waiting will fix a particular run.',
        ],
      },
      {
        id: 'not-sure',
        question: 'It says "WattWise is not sure what this is". Is something broken?',
        answer: [
          'No. That message is the honest answer to a genuinely ambiguous measurement, and it is better than a confident guess.',
          'It appears when several appliance profiles explain the run about equally well - close enough that the power reading alone cannot separate them. Rather than assert the top one, WattWise lists the closest matches with their scores and lets you decide.',
          'You can pick the closest and rename it afterwards. WattWise stores how your appliance actually draws power, not the name it started from, so the label being imperfect costs you nothing.',
        ],
      },
      {
        id: 'wrong-name-bill',
        question: 'It named my appliance wrongly. Does that affect my bill?',
        answer: [
          'No, and this is deliberate in the design.',
          'Energy comes from the meter. Cost comes from applying the PELCO III rates to that measured energy. The safety cut-off compares measured watts against your threshold. None of those three read the appliance name.',
          'A wrong name affects exactly one thing: the per-appliance breakdown that tells you which device used what. Your total energy, your cost, your budget and your safety protection are unaffected.',
        ],
      },
      {
        id: 'changed',
        question: 'Why does it say "Different appliance detected"?',
        answer: [
          'Because you swapped what is plugged in without switching the outlet off, so WattWise is still measuring one continuous run.',
          'A run ends when the outlet is switched off. If a 14 W lamp is replaced by a 56 W fan on a live outlet, both end up inside the same run and the average lands between them - a figure neither appliance ever drew, which then gets matched to some third thing entirely.',
          'Switch the outlet off and on again. That closes the old run and starts a clean one for the new appliance.',
        ],
      },
      {
        id: 'forget',
        question: 'What is the difference between Rename and Forget?',
        answer: [
          'Rename changes the label and keeps the measurements. Use it whenever the name is wrong but the appliance is right.',
          'Forget deletes the measurement itself. Detection falls back to the built-in profiles, so that appliance is recognised only by its general shape rather than by how yours actually draws power.',
          'Forget cannot be undone. Getting a signature back means plugging the appliance in and letting WattWise measure a full run again, so if you only meant to correct a name, use Rename.',
        ],
      },
    ],
  },
  {
    id: 'measuring',
    title: 'Measuring, safety and charging',
    icon: '⚡',
    topics: [
      {
        id: 'how-measured',
        question: 'How does WattWise know how much energy I used?',
        answer: [
          'It measures it. Each outlet has an energy meter that reports voltage, current, power and an accumulating energy counter, and the app reads those figures directly.',
          'Nothing about your energy total is inferred from which appliance WattWise thinks is plugged in. That is why an uncertain appliance name does not put your usage or your bill in doubt.',
        ],
      },
      {
        id: 'cutoff',
        question: 'What happens if an appliance draws too much power?',
        answer: [
          'The safety cut-off compares the measured wattage against the limit you set in Power Safety and switches the outlet off when it is exceeded.',
          'It acts on the measurement, never on the appliance name, so it protects you the same whether WattWise identified the load correctly, guessed wrong, or had no idea what it was.',
          'WattWise is built for low-voltage appliances - chargers, laptops, fans, TVs, LED lamps, consoles. It is not intended for heating appliances or anything with a large motor.',
        ],
      },
      {
        id: 'charging-done',
        question: 'What is the "Charging looks finished" notification?',
        answer: [
          'WattWise watches the wattage curve. When a charge tapers off and then rests at a low level for several minutes, it tells you the battery has most likely finished.',
          'It only tells you. It never switches the outlet off by itself - that decision stays with you.',
          'It stays quiet in two cases on purpose. If a charger rests below what the meter can detect, that looks identical to you having unplugged the device, so WattWise says nothing rather than claim something it cannot see.',
          'And a run has to have drawn real power to count as a charge at all. Topping up a nearly full battery may never draw enough for WattWise to call it charging, so no notification follows. Missing one is the intended trade: the alternative is announcing a finished charge to someone who simply unplugged their phone.',
        ],
      },
      {
        id: 'no-readings',
        question: 'Why does it say "No readings"?',
        answer: [
          'The app has not heard from your WattWise unit recently. The figures it last saw are held back rather than shown, because a frozen number that looks live is worse than no number at all.',
          'Check that the unit is powered and that its Wi-Fi is in range. Readings resume on their own once it reconnects; nothing is lost while it is away, as the energy counter lives on the meter itself.',
        ],
      },
    ],
  },
  {
    id: 'scope',
    title: 'What WattWise covers',
    icon: '📋',
    topics: [
      {
        id: 'two-outlets',
        question: 'Why only two outlets?',
        answer: [
          'WattWise is built as a two-outlet monitor: one unit, two independently metered and independently switched sockets.',
          'Everything the app reports - usage, cost, history, budget - describes what passed through those two outlets. Anything plugged in elsewhere in the room is invisible to it.',
        ],
      },
      {
        id: 'budget-scope',
        question: 'Should my monthly budget be my whole electricity budget?',
        answer: [
          'No. Set it against what these two outlets should cost, not against your whole bill.',
          'If you budget for your entire household but WattWise only measures two sockets, it will report you comfortably under budget every month while the real bill says otherwise.',
        ],
      },
      {
        id: 'suggestion-first',
        question: 'Will WattWise change things on its own?',
        answer: [
          'It will not rename an appliance, accept a suggestion, or adopt a detected identity without you confirming it. Detection proposes; you decide.',
          'The one thing that acts automatically is the safety cut-off, which switches an outlet off when the measured power exceeds the limit you configured. That is deliberate - it is a protection, and it works on measurement rather than on any guess about what is plugged in.',
        ],
      },
    ],
  },
];

export default HELP_SECTIONS;
