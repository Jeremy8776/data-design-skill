# Concept round

Use this reference when the user asks to draft concepts, compare approaches, explore options, or when several materially different interventions remain viable after clarifying questions.

The concept round is an optional working step inside **Report**. It helps the architect choose a direction before authoring the thesis. It does not add a fifth top-level stage and it must not turn model invention into company truth.

## Readiness gate

Run the round only when:

- the authorised evidence boundary is understood;
- consequential access, authority, and ownership questions are answered or explicitly carried as assumptions;
- there is enough evidence to compare interventions honestly;
- the decision is genuinely open.

If only one safe path remains, explain why and skip the theatre of artificial choice. If evidence is insufficient, return to Clarifying questions.

## Create distinct concepts

Draft two to four concepts. When doing less, delaying, or staying consultant-led is viable, include a minimum-change baseline as one of them.

Choose the axes from the case rather than from generic technology categories. Useful tensions may include centralised versus federated ownership, bought platform versus composed capabilities, automation versus human checkpoints, or vendor convenience versus portability. Cosmetic variants do not count as different concepts.

Each concept must include:

- a short name and one-sentence thesis;
- the organisational problem it addresses;
- what changes for the people doing the work;
- the smallest viable intervention;
- supporting observation, answer, and record IDs;
- assumptions and unresolved dependencies;
- integrations and permission boundaries;
- operating burden, cost shape, lock-in, and portability;
- benefits and trade-offs;
- reversibility and kill criteria;
- one sentence explaining why it is materially different from the other concepts.

Do not invent prices, platform capabilities, organisational ownership, implementation times, or benefits. Mark any unverified value as an assumption or omit it.

## Present the choice

Give every concept equal descriptive depth. Separate neutral comparison from the model's preference. The architect may:

- select one concept;
- combine named elements from several concepts;
- steer a new round with a constraint such as lower cost, less disruption, more portability, more human control, or greater ambition;
- defer the choice;
- reject the set.

Ask for one decision after presenting the set. Do not bury the user in a sequence of follow-up questions.

## Preserve the round

Append a round to `case.conceptRounds` using `references/schemas/concept-round.schema.json`. A revised set is a new round with `supersedesRoundId` and the user's steer. Never overwrite an earlier round.

Record the architect's response in `case.conceptDecision`. A combined decision must name each borrowed element and its source concept. Keep the decision separate from human-verified organisational answers.

The final thesis cites the selected concept IDs, explains the choice, names rejected trade-offs that remain relevant, and carries unresolved assumptions into risks or next actions.
