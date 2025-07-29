-- Add RLS policies for restaurants table to allow admin updates
CREATE POLICY "Admins can insert restaurants" 
ON public.restaurants 
FOR INSERT 
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update restaurants" 
ON public.restaurants 
FOR UPDATE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can delete restaurants" 
ON public.restaurants 
FOR DELETE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Also add similar policies for other content tables if they're missing
CREATE POLICY "Admins can insert attractions" 
ON public.attractions 
FOR INSERT 
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update attractions" 
ON public.attractions 
FOR UPDATE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can delete attractions" 
ON public.attractions 
FOR DELETE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can insert playgrounds" 
ON public.playgrounds 
FOR INSERT 
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update playgrounds" 
ON public.playgrounds 
FOR UPDATE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can delete playgrounds" 
ON public.playgrounds 
FOR DELETE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can insert restaurant_openings" 
ON public.restaurant_openings 
FOR INSERT 
WITH CHECK (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can update restaurant_openings" 
ON public.restaurant_openings 
FOR UPDATE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admins can delete restaurant_openings" 
ON public.restaurant_openings 
FOR DELETE 
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));