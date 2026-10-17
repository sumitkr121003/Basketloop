import React from "react";

interface TokenIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export function TokenIcon({ symbol, size = 24, className = "" }: TokenIconProps) {
  const s = symbol.toUpperCase();

  switch (s) {
    case "ETH":
      // Official Ethereum Diamond (Slate / White dual-facet)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 4L9 16.5L16 20.5L23 16.5L16 4Z" fill="white" fillOpacity="0.8" />
          <path d="M16 4L16 20.5L23 16.5L16 4Z" fill="white" />
          <path d="M16 21.8L9 17.8L16 28L23 17.8L16 21.8Z" fill="white" fillOpacity="0.8" />
          <path d="M16 21.8L16 28L23 17.8L16 21.8Z" fill="white" />
          <path d="M16 19.5L9 15.5L16 12.3L23 15.5L16 19.5Z" fill="#3952B0" fillOpacity="0.2" />
        </svg>
      );

    case "WETH":
      // Official Wrapped Ether (Purple / Gradient Diamond)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#ec4899" />
          <circle cx="16" cy="16" r="15" fill="#1e1b4b" stroke="#f472b6" strokeWidth="1" />
          <path d="M16 5.5L9.5 16.5L16 20L22.5 16.5L16 5.5Z" fill="#f472b6" fillOpacity="0.85" />
          <path d="M16 5.5L16 20L22.5 16.5L16 5.5Z" fill="#fbcfe8" />
          <path d="M16 21.2L9.5 17.8L16 26.5L22.5 17.8L16 21.2Z" fill="#f472b6" fillOpacity="0.85" />
          <path d="M16 21.2L16 26.5L22.5 17.8L16 21.2Z" fill="#fbcfe8" />
        </svg>
      );

    case "USDC":
      // Official USD Coin (Blue circle with interlaced $ logo)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <path
            d="M16 6C10.477 6 6 10.477 6 16C6 21.523 10.477 26 16 26C21.523 26 26 21.523 26 16C26 10.477 21.523 6 16 6ZM17.2 21.8V23.5H15.1V21.8C12.7 21.5 11.2 20.1 11.1 18.2H13.4C13.5 19.3 14.3 20.1 16.1 20.1C17.7 20.1 18.7 19.4 18.7 18.4C18.7 17.3 17.8 16.8 15.6 16.3C12.8 15.6 11.4 14.7 11.4 12.8C11.4 11.2 12.8 9.9 15.1 9.6V8H17.2V9.6C19.2 9.9 20.6 11.2 20.7 12.8H18.5C18.4 11.9 17.7 11.3 16.1 11.3C14.7 11.3 13.8 11.9 13.8 12.7C13.8 13.6 14.6 14.1 16.7 14.6C19.6 15.3 21.1 16.3 21.1 18.2C21.1 20.2 19.6 21.5 17.2 21.8Z"
            fill="white"
          />
        </svg>
      );

    case "USDT":
      // Official Tether USD (Emerald teal with Tether T)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#26A17B" />
          <path
            d="M17.8 15.5V13.8H23V11H9V13.8H14.2V15.5C10.2 15.8 7.2 16.8 7.2 18C7.2 19.2 10.2 20.2 14.2 20.5V25H17.8V20.5C21.8 20.2 24.8 19.2 24.8 18C24.8 16.8 21.8 15.8 17.8 15.5ZM16 19.4C12.6 19.4 9.8 18.7 9.8 18C9.8 17.3 12.6 16.6 16 16.6C19.4 16.6 22.2 17.3 22.2 18C22.2 18.7 19.4 19.4 16 19.4Z"
            fill="white"
          />
        </svg>
      );

    case "LINK":
      // Official Chainlink (Blue Hexagon)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#375BD2" />
          <path
            d="M16 7L10 10.5V17.5L16 21L22 17.5V10.5L16 7ZM19.8 16.2L16 18.4L12.2 16.2V11.8L16 9.6L19.8 11.8V16.2Z"
            fill="white"
          />
          <path d="M16 11.5L13.5 13V16L16 17.5L18.5 16V13L16 11.5Z" fill="white" />
        </svg>
      );

    case "UNI":
      // Official Uniswap (Pink with Unicorn silhouette)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#FF007A" />
          <path
            d="M18.7 8.5C18.2 8.5 17.8 8.8 17.5 9.2L14.6 13.5C14.1 14.2 13.2 14.5 12.4 14.2L9.8 13.2C9 12.9 8.1 13.5 8.1 14.4C8.1 18.5 11.2 21.8 15.2 22C19.7 22.2 23.4 18.6 23.4 14.1C23.4 10.7 21.1 8.5 18.7 8.5ZM16.2 16.5C15.4 16.5 14.7 15.8 14.7 15C14.7 14.2 15.4 13.5 16.2 13.5C17 13.5 17.7 14.2 17.7 15C17.7 15.8 17 16.5 16.2 16.5Z"
            fill="white"
          />
        </svg>
      );

    case "ARB":
      // Official Arbitrum (Navy with stylized A chevron)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#28A0F0" />
          <path
            d="M15.8 7.5L8.5 21.5L11.5 23.2L15.8 14.8L20.2 23.2L23.2 21.5L15.8 7.5ZM13.8 19L15.8 15.2L17.8 19H13.8Z"
            fill="white"
          />
        </svg>
      );

    default:
      // Neutral fallback with clean typography and gradient border
      return (
        <div
          style={{ width: size, height: size }}
          className={`rounded-full bg-surface border border-border-prominent flex items-center justify-center font-mono font-bold text-[10px] text-text-secondary shrink-0 ${className}`}
        >
          {s.slice(0, 3)}
        </div>
      );
  }
}
