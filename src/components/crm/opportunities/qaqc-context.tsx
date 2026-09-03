'use client'

import { createContext, useContext } from 'react'
import type { QaqcState } from '@/server/actions/qaqc'

/**
 * QAQC state shared across the kanban tree so deeply-nested cards + the detail
 * modal can read/toggle a lead's verification without threading props through
 * every column component. Provided by KanbanBoard; defaults render nothing
 * (canQAQC=false) so a card used outside the board — e.g. the Customise Card
 * preview — simply hides the tick.
 */
export interface QaqcContextValue {
  /** Viewer may see + toggle the tick (Super Admin / Regional Manager / Op). */
  canQAQC: boolean
  /** Viewer may unverify + edit the date (Super Admin only). */
  canManage: boolean
  get: (opportunityId: string) => QaqcState | undefined
  /** Optimistic toggle (verify, or unverify when allowed). */
  toggle: (opportunityId: string) => void
  /** Replace one lead's cached state (used by the detail panel's onChange). */
  set: (opportunityId: string, state: QaqcState) => void
}

const QaqcContext = createContext<QaqcContextValue>({
  canQAQC: false,
  canManage: false,
  get: () => undefined,
  toggle: () => {},
  set: () => {},
})

export const QaqcProvider = QaqcContext.Provider

export function useQaqc(): QaqcContextValue {
  return useContext(QaqcContext)
}
