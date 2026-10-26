# UI theme

Shared tokens live in `lib/theme/`:

- **`brand.ts`** — App name, tagline, URL scheme
- **`colors.ts`** — Backgrounds, surfaces, borders, text, accents, **`txPositive` / `txNegative`** for wallet lines
- **`spacing.ts`** — `space.*` and `radius.*`
- **`typography.ts`** — `type.hero`, `type.title`, `type.body`, etc.
- **`challengePills.ts`** — `challengePills.open` | `progress` | `done` | `muted` | `sponsored` | `money` for **ChallengeCard** status / VC chips (translucent fills + borders on dark surfaces)

## Usage

```ts
import { colors } from "../lib/theme/colors";
import { space, radius } from "../lib/theme/spacing";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
  },
});
```

`EmptyState` and skeleton loaders should use the same palette for a consistent feel.

### Challenge pills

```ts
import { challengePills } from "../lib/theme/challengePills";

<View style={[styles.pill, challengePills.open]}>
  <Text>Open</Text>
</View>
```
