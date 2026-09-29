import clientAxios from "@/utils/clientAxios.util";
import { API_ROUTES } from "@/constants/routes";

export interface CreateUserDto {
  name: string;
  email: string;
}

export interface UpdateUserDto extends Partial<CreateUserDto> {}

export const userService = {
  async create(dto: CreateUserDto) {
    const { data } = await clientAxios.post(API_ROUTES.USERS, dto);
    return data;
  },

  async update(id: string, dto: UpdateUserDto) {
    const { data } = await clientAxios.put(`${API_ROUTES.USERS}/${id}`, dto);
    return data;
  },

  async delete(id: string) {
    const { data } = await clientAxios.delete(`${API_ROUTES.USERS}/${id}`);
    return data;
  },

  async findById(id: string) {
    const { data } = await clientAxios.get(`${API_ROUTES.USERS}/${id}`);
    return data;
  },

  async findAll(search?: string) {
    const params = search ? { search } : {};
    const { data } = await clientAxios.get(API_ROUTES.USERS, { params });
    return data;
  },
};
