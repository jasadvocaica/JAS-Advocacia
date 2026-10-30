import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/contexts/AuthContext';
import {operar} from './api';
export function useComercial(){const {user,profile}=useAuth();return useQuery({queryKey:['comercial-contexto',user?.id],queryFn:()=>operar('contexto'),enabled:!!user?.id&&profile?.ativo&&(profile.tipo_portal??'interno')==='interno',retry:false,refetchInterval:60000});}
