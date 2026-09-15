import { Icon } from "@/components/ui/icon";

const steps = [
  {
    title: "Set the terms",
    text: "Connect your wallet, choose the tokens and exact amounts, and set an expiration. You are the maker. Allow anyone with the link to accept, or restrict the order to one wallet.",
  },
  {
    title: "Approve and sign",
    text: "Review your order. If needed, approve the settlement contract to spend your token, then sign the order in your wallet. Signing creates the offer; it does not transfer or lock your tokens.",
  },
  {
    title: "Share the trade link",
    text: "Copy the complete link and send it to your counterparty. The link contains the signed order. Keep a copy somewhere you can find again, even if your browser history is lost.",
  },
  {
    title: "Accept and exchange",
    text: "The recipient—the taker—opens the link, checks the terms, connects an eligible wallet, and approves their token if needed. Accept trade submits the exchange. Both token transfers happen in one transaction; if either fails, the transaction reverts. Wait for confirmation.",
  },
];

const questions = [
  {
    question: "Can someone fill an order I lost?",
    answer:
      "Yes. Someone who still has the link can submit it while the order is unfilled, uncancelled, and unexpired. They must be an eligible taker, and both wallets must have the required balances and approvals. Clearing browser storage does not invalidate your signature.",
  },
  {
    question: "How do I cancel an order?",
    answer:
      "Open the trade link, or open the order from History. Connect the maker wallet on the order’s network, choose Cancel order, and confirm the cancellation transaction. Cancellation takes effect when confirmed onchain. If a fill confirms first, the trade has already happened. Rejecting a wallet prompt does not cancel a signed order.",
  },
  {
    question: "Are my tokens locked when I sign?",
    answer:
      "No. Tokens stay in your wallet until a trade settles. An approval gives the contract permission to spend a token; the signed order specifies the trade you authorize. An Open order may still fail to settle if a wallet no longer has enough tokens or allowance.",
  },
  {
    question: "Who can accept my link?",
    answer:
      "For an unrestricted order, anyone with the link other than the maker can accept. The first successful fill wins. For a restricted order, only the designated wallet can accept. Treat an unrestricted link as an offer that can be forwarded.",
  },
  {
    question: "Can I recover my history on another browser or device?",
    answer:
      "History does not sync across browsers or devices. If you kept the complete trade link, reopen it and connect the maker wallet to save that order in the current browser again, provided browser storage is available. Without a retained link, the app cannot restore the complete signed offer from your wallet address alone.",
  },
  {
    question: "What do Open, Filled, Cancelled, and Expired mean?",
    answer:
      "Open means the order has not been filled or cancelled and its deadline has not passed; it is not a guarantee that funds and approvals are available. Filled means the exchange succeeded. Cancelled means the maker invalidated the order onchain. Expired means its deadline has passed. Status unavailable means the app could not verify the current chain state.",
  },
  {
    question: "Can I change an order or fill only part of it?",
    answer:
      "Signed terms cannot be edited, and orders are filled in full. Create a new order for different terms and cancel the old one if you no longer want it filled. Each separately signed order has its own identity, even when the tokens and amounts match.",
  },
  {
    question: "Which actions need a network fee?",
    answer:
      "Signing the order is an offchain signature. Token approvals, accepting a trade, and cancelling an order are onchain transactions and require the network’s native token for gas. A reverted transaction can still cost gas.",
  },
  {
    question: "Are private trades hidden from the blockchain?",
    answer:
      "Private means you share an offer by link instead of posting it to a public order book. Anyone with the link can read its terms. Completed trades and cancellations are public blockchain transactions.",
  },
];

export function Help() {
  return (
    <div className="help-screen">
      <div className="screen-heading">
        <h1>How Handshake works</h1>
      </div>
      <p className="help-intro">
        Agree on a trade. Share a link. Exchange directly between wallets.
      </p>

      <section className="help-panel" aria-labelledby="help-flow-title">
        <h2 id="help-flow-title">From offer to exchange</h2>
        <p>
          Handshake lets two people exchange agreed token amounts through a
          settlement contract. There is no matching engine: you choose the terms
          and share the offer yourself.
        </p>
        <ol className="help-flow" aria-label="Trade flow">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="help-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="help-panel help-storage"
        aria-labelledby="help-storage-title"
      >
        <span className="help-eyebrow">Keep your links</span>
        <h2 id="help-storage-title">Your history lives in this browser</h2>
        <p>
          Saved orders and filled-trade history are kept only in this browser’s
          local storage, scoped to your wallet and network. Handshake does not
          keep a server backup or sync them to your wallet.
        </p>
        <p>
          Clearing site data, using a private browsing session, switching
          browsers or devices, or losing access to browser storage can leave you
          without your saved orders.
        </p>
        <p className="help-storage-emphasis">
          Losing an order does not cancel it.
        </p>
        <p>
          Someone with a copy of the trade link may still execute the order if
          its conditions are met. Keep your own copy of the link, and confirm an
          onchain cancellation when you want to withdraw an open offer.
        </p>
      </section>

      <section className="help-panel" aria-labelledby="help-faq-title">
        <h2 id="help-faq-title">Frequently asked questions</h2>
        <div className="help-faq">
          {questions.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <Icon name="chevron-down" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        id="contract-risk"
        className="help-panel help-risk"
        aria-labelledby="help-risk-title"
      >
        <h2 id="help-risk-title">Contract risk</h2>
        <p>This contract has not been audited. Use at your own risk.</p>
        <p>
          Bugs in the contract or app may put your funds at risk. Check the
          token contracts, amounts, recipient restriction, network, and wallet
          prompts before approving or signing. Token-list membership does not
          guarantee a token is safe.
        </p>
      </section>
    </div>
  );
}
