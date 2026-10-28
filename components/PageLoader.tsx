'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  /** 主標題 — 例: '登入成功' */
  title?: string;
  /** 副標題 — 例: '正在進入系統...' */
  subtitle?: string;
}

/**
 * 全螢幕 Page Loader — 用於登入成功、頁面跳轉前等「即將進入」的空檔。
 * 純 framer-motion 進場動畫 + Lucide spinner, 不依賴 AnimatePresence,
 * 由父層用 state 控制掛載。
 */
export function PageLoader({
  title = '登入成功',
  subtitle = '正在進入系統...',
}: PageLoaderProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* 卡片本體 */}
      <motion.div
        className="flex flex-col items-center gap-4 px-8 py-7 rounded-2xl liquid-glass shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      >
        {/* 旋轉圈 — 雙圈設計, 外圈慢、內圈快, 更有層次 */}
        <div className="relative w-14 h-14">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary/20"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
          {/* 中心 icon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
          >
            <Loader2 className="w-5 h-5 text-primary" />
          </motion.div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <motion.p
            className="text-base font-semibold text-foreground"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.28, ease: 'easeOut' }}
          >
            {title}
          </motion.p>
          <motion.p
            className="text-xs text-muted-foreground"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.28, ease: 'easeOut' }}
          >
            {subtitle}
          </motion.p>
        </div>

        {/* 底部進度小點 */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-primary"
              initial={{ opacity: 0.25, y: 0 }}
              animate={{
                opacity: [0.25, 1, 0.25],
                y: [0, -3, 0],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
