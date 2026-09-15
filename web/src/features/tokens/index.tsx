"use client";
import { Select } from "@/components/ui/select";

import { useState } from "react";
import { useChains } from "wagmi";
import { TokenSelector } from "./token-selector";
import type { ListedToken } from "@/infrastructure/http/cow-list";

export function TokenExplorer() {
  const chains = useChains();
  const [chainId, setChainId] = useState(100);
  const [selected, setSelected] = useState<ListedToken>();
  const chainName = chains.find((chain) => chain.id === chainId)?.name;
  return (
    <div className="space-y-4">
      <label htmlFor="token-network">Token network</label>
      <Select
        id="token-network"
        className="block rounded border p-2"
        value={chainId}
        onChange={(event) => {
          setChainId(Number(event.target.value));
          setSelected(undefined);
        }}
      >
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name}
          </option>
        ))}
      </Select>
      <TokenSelector
        key={chainId}
        chainId={chainId}
        label="Token"
        mode="inspect"
        onSelect={setSelected}
      />
      {selected && (
        <p role="status">
          Selected {selected.symbol || selected.address} on {chainName}
        </p>
      )}
    </div>
  );
}
export { TokenSelector } from "./token-selector";
export { TokenNotice } from "./token-notice";
export { TokenIdentity } from "./token-identity";

export { TokenBalance } from "./token-balance";
