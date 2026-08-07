import { Suspense } from 'react'
import { NoNexusPageClient } from '@/components/crm/no-nexus-page'

export const metadata = {
  title: 'No Nexus | Ebright Nexus',
}

export default function NoNexusPage() {
  // useSearchParams needs a Suspense boundary to keep the route statically
  // renderable rather than forcing the whole segment dynamic.
  return (
    <Suspense fallback={null}>
      <NoNexusPageClient />
    </Suspense>
  )
}
