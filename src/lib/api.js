import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    // На самом логине/me не редиректим — ошибку показываем в форме.
    const isAuthProbe = url.includes('/auth/login') || url.includes('/auth/me') || url.includes('/auth/invite')
    if (err.response?.status === 401 && !isAuthProbe) {
      localStorage.removeItem('token')
      window.location.href = `${import.meta.env.BASE_URL}login`
    }
    return Promise.reject(err)
  }
)

export default api
