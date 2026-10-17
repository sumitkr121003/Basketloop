import React from "react";

interface NetworkIconProps {
  chainId?: number;
  size?: number;
  className?: string;
}

export function NetworkIcon({ chainId = 46630, size = 20, className = "" }: NetworkIconProps) {
  switch (chainId) {
    case 46630: // Robinhood Chain Testnet
    case 4663: // Robinhood Chain Mainnet
      // Official Robinhood Chain Feather on dark badge with neon accent
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${className}`}
        >
          <circle cx="16" cy="16" r="16" fill="#0D0E11" />
          <path
            d="M21.5 6.5C18.2 8.1 13.5 12.5 11.8 17.5C10.8 20.5 10.2 24.2 10 25.5C10 25.5 12.8 23.2 15 20.2C16.8 17.8 18.8 13.5 21.5 6.5Z"
            fill="#CCFF00"
          />
          <path
            d="M14.5 19.2C13.2 18.2 12.2 16.5 12.2 16.5L14.8 16L14.5 19.2Z"
            fill="#0D0E11"
          />
          <path
            d="M17 14.8C15.8 13.8 14.8 12.2 14.8 12.2L17.2 11.8L17 14.8Z"
            fill="#0D0E11"
          />
        </svg>
      );

    case 421614: // Arbitrum Sepolia
    case 42161: // Arbitrum One
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

    case 1: // Ethereum Mainnet
    case 11155111: // Sepolia
    default:
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
        </svg>
      );
  }
}
