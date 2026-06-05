import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken } from '@/services/api'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: { name: 'connections' } },
      { path: 'connections', name: 'connections', component: () => import('@/views/ConnectionsView.vue') },
      // Connection-scoped tools
      { path: 'c/:connectionId/health', name: 'health', component: () => import('@/views/QueueHealthView.vue'), props: true },
      { path: 'c/:connectionId/jobs', name: 'jobs', component: () => import('@/views/JobsView.vue'), props: true },
      { path: 'c/:connectionId/failed', name: 'failed', component: () => import('@/views/FailedJobsView.vue'), props: true },
      { path: 'c/:connectionId/batches', name: 'batches', component: () => import('@/views/BatchesView.vue'), props: true },
      { path: 'c/:connectionId/monitor', name: 'monitor', component: () => import('@/views/MonitorView.vue'), props: true }
    ]
  }
]

// Hash history: the SPA is served statically at /spa/ alongside ColdBox's /api, so client-side
// deep links (#/connections) never collide with the server's URL rewrites.
const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) return { name: 'login', query: { redirect: to.fullPath } }
})

export default router
