import { TokenExplorer } from "@/features/tokens";

export default function Home() {
  return (
    <>
      <h1>Create a trade</h1>
      <p className="mb-4 text-muted-foreground">
        Choose a listed token to inspect its onchain information.
      </p>
      <TokenExplorer />
    </>
  );
}
