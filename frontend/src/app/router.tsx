import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { HomeRoute } from '@/app/routes/home';

const router = createBrowserRouter([{ path: '/', element: <HomeRoute /> }]);

export const AppRouter = () => <RouterProvider router={router} />;
