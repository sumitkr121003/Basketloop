import { NextRequest, NextResponse } from "next/server";
import { getTokensForChain, type TokenInfo } from "@/lib/tokens";
import { fetchMultipleTokenPrices } from "@/lib/prices";
import { calculateSwapQuote } from "@/lib/quote";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get("chainId");
  const tokenInSymbol = searchParams.get("tokenIn") || "USDC";
  const tokenOutSymbol = searchParams.get("tokenOut") || "ETH";
  const amountIn = searchParams.get("amountIn") || "100";
  const slippageParam = searchParams.get("slippage") || "0.5";

  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : 46630;
  const slippage = parseFloat(slippageParam) || 0.5;

  const chainTokens = getTokensForChain(chainId);
  const tokenIn = chainTokens.find((t) => t.symbol.toUpperCase() === tokenInSymbol.toUpperCase()) || chainTokens[2];
  const tokenOut = chainTokens.find((t) => t.symbol.toUpperCase() === tokenOutSymbol.toUpperCase()) || chainTokens[0];

  if (!tokenIn || !tokenOut) {
    return NextResponse.json({ error: "Unsupported token pair" }, { status: 400 });
  }

  const prices = await fetchMultipleTokenPrices([tokenIn.symbol, tokenOut.symbol]);
  const quote = calculateSwapQuote({
    tokenIn,
    tokenOut,
    amountIn,
    slippage,
    prices,
  });

  return NextResponse.json(quote, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=15",
    },
  });
}
