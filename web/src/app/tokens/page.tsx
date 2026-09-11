import { TokenExplorer } from "@/features/tokens";

export default function Home() {
  return (
    <>
      <h1>Explore tokens</h1>
      <p className="mb-4 text-muted-foreground">
        Choose a listed token to inspect its onchain information.
      </p>
      <TokenExplorer />
    </>
  );
}
