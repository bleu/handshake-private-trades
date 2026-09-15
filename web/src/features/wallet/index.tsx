"use client";

import { useState } from "react";
import { useAccount, useChainId, useChains, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { ChainIcon } from "./chain-icon";
import { Button } from "@/components/ui/button";

export function WalletControls() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  const { switchChain, error } = useSwitchChain();
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="wallet-controls">
      {!isConnected && (
        <Button
          className="wallet-network-control"
          aria-label="Chain Selector"
          onClick={() => {
            setChoosing(true);
          }}
        >
          <ChainIcon chainId={chainId} />
          <span>
            {chains.find((chain) => chain.id === chainId)?.name ??
              "Select network"}
          </span>
          <Icon name="chevron-down" />
        </Button>
      )}
      <ConnectButton.Custom>
        {({
          account,
          chain,
          mounted,
          openConnectModal,
          openChainModal,
          openAccountModal,
        }) =>
          account && chain ? (
            <>
              <Button
                aria-label="Chain Selector"
                className="wallet-network-control"
                onClick={openChainModal}
              >
                <ChainIcon chainId={chain.id} />
                <span>{chain.unsupported ? "Wrong network" : chain.name}</span>
                <Icon name="chevron-down" />
              </Button>
              <Button onClick={openAccountModal}>{account.displayName}</Button>
            </>
          ) : (
            <Button disabled={!mounted} onClick={openConnectModal}>
              Connect Wallet
            </Button>
          )
        }
      </ConnectButton.Custom>
      {!isConnected && choosing && (
        <Dialog
          title="Select network"
          onClose={() => {
            setChoosing(false);
          }}
        >
          {error && <p role="alert">Unable to change network. Please retry.</p>}
          {chains.map((chain) => (
            <Button
              key={chain.id}
              onClick={() => {
                switchChain(
                  { chainId: chain.id },
                  {
                    onSuccess: () => {
                      setChoosing(false);
                    },
                  },
                );
              }}
            >
              <ChainIcon chainId={chain.id} /> {chain.name}
            </Button>
          ))}
        </Dialog>
      )}
    </div>
  );
}
