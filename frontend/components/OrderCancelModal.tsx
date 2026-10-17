"use client";

import React from "react";
import { AlertTriangle, X, Loader2, ShieldCheck, ArrowRight, CornerDownLeft } from "lucide-react";
import { type LimitOrderData } from "@/lib/limitOrders";
import { TokenIcon } from "./TokenIcon";

interface OrderCancelModalProps {
  isOpen: boolean;
  order: LimitOrderData | null;
  onClose: () => void;
  onConfirmCancel: (order: LimitOrderData) => Promise<void>;
  isCancelling: boolean;
}

export function OrderCancelModal({
  isOpen,
  order,
  onClose,
  onConfirmCancel,
  isCancelling,
}: OrderCancelModalProps) {
  if (!isOpen || !order) return null;

  const handleConfirm = async () => {
    await onConfirmCancel(order);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isCancelling}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800/60 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Cancel Limit Order</h3>
            <p className="text-xs text-slate-400">
              Order #{order.id} • Robinhood Chain Testnet
            </p>
          </div>
        </div>

        {/* Escrow Refund Breakdown */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Escrowed Tokens to Return</span>
            <span className="text-slate-200 font-semibold font-mono">100% Refund</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2.5">
              <TokenIcon symbol={order.tokenIn.symbol} size={24} />
              <div>
                <span className="text-white font-bold text-base block">
                  {order.amountIn} {order.tokenIn.symbol}
                </span>
                <span className="text-[11px] text-slate-400">Returned upon cancellation</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                100% Refund
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Target Price:</span>
            <span className="text-slate-200 font-mono font-medium">
              1 {order.tokenIn.symbol} = {order.targetPrice} {order.tokenOut.symbol}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Target Minimum Output:</span>
            <span className="text-slate-200 font-mono font-medium">
              ≥ {order.minAmountOut} {order.tokenOut.symbol}
            </span>
          </div>
        </div>

        {/* Cancellation Notice */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px] text-slate-400">
            Cancelling will return{" "}
            <strong className="text-slate-200">{order.amountIn} {order.tokenIn.symbol}</strong> directly to your connected wallet. No cancellation fee is charged.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all disabled:opacity-50"
          >
            Keep Order
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isCancelling}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-sm shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isCancelling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirming in Wallet...</span>
              </>
            ) : (
              <span>Confirm Cancellation</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
