'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Bus, User, Clock, MapPin } from 'lucide-react';
import { cn, tripTypeLabel, tripStatusLabel, fmtTime, waypointTypeLabel } from '@/lib/utils';
import type { Trip } from '@/lib/types';

interface TripCardProps {
  trip: Trip;
  busPlate: string;
  driverName: string;
  nannyName: string;
  index: number;
  onClick: () => void;
  className?: string;
}

export function TripCard({
  trip,
  busPlate,
  driverName,
  nannyName,
  index,
  onClick,
  className,
}: TripCardProps) {
  const completedStops = trip.completedStops.length;
  const totalStops = trip.waypoints.length;
  const progress = totalStops > 0 ? completedStops / totalStops : 0;

  const statusColor = {
    scheduled: 'bg-muted text-muted-foreground',
    in_progress: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-destructive/10 text-destructive',
  }[trip.status];

  const typeColor = {
    morning: 'bg-amber-100 text-amber-700',
    afternoon: 'bg-blue-100 text-blue-700',
    custom: 'bg-purple-100 text-purple-700',
  }[trip.type];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'w-full text-left rounded-2xl p-3 bg-card border border-border/50',
        'shadow-sm active:scale-[0.98] transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', typeColor)}>
            {tripTypeLabel(trip.type)}
          </span>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', statusColor)}>
            {tripStatusLabel(trip.status)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{fmtTime(trip.plannedStartTime)}</span>
        </div>
      </div>

      {/* Bus info */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Bus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold truncate">{busPlate}</span>
        {driverName && (
          <>
            <span className="text-muted-foreground opacity-40">·</span>
            <span className="text-xs text-muted-foreground truncate">{driverName}</span>
          </>
        )}
      </div>

      {/* Nanny info */}
      <div className="flex items-center gap-1.5 mb-2">
        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate">{nannyName}</span>
      </div>

      {/* Route preview */}
      {trip.waypoints.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 overflow-hidden">
          <MapPin className="w-3 h-3 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {trip.waypoints
              .slice(0, 3)
              .map((w) => `${waypointTypeLabel(w.type)} ${w.location.name}`)
              .join(' → ')}
            {trip.waypoints.length > 3 && ` (+${trip.waypoints.length - 3})`}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {trip.status !== 'scheduled' && trip.status !== 'cancelled' && totalStops > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{completedStops}/{totalStops} 站點已完成</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}
    </motion.button>
  );
}
