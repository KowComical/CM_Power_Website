import subprocess
import os
import pandas as pd
import os

global_path = '/data/xuanrenSong/CM_Power_Website'
file_path = os.path.join(global_path, 'data')

country_list = ['Australia', 'Brazil', 'Chile', 'China',
                'EU27&UK', 'France', 'Germany',
                'India', 'Italy', 'Japan', 'Mexico', 'New Zealand',
                'Russia', 'South Africa', 'Spain',
                'Turkey', 'United Kingdom', 'United States']


def main():
    # 先更新数据
    process_data()
    # Usage:
    git_push(global_path)


def process_data():
    df = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv')

    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
    df = pd.pivot_table(df, index=['country', 'date'], values='value', columns='sector').reset_index()
    df.columns = ['country', 'date', 'coal', 'gas', 'hydro', 'nuclear', 'oil', 'other', 'solar', 'wind']
    df['total'] = df.sum(axis=1, numeric_only=True)
    df['fossil'] = df[['coal', 'gas', 'oil']].sum(axis=1)
    df['renewables'] = df[['hydro', 'other', 'solar', 'wind']].sum(axis=1)

    df['country'] = df['country'].str.replace('EU27 & UK', 'EU27&UK')
    df['country'] = df['country'].replace('UK', 'United Kingdom')
    df['country'] = df['country'].str.replace('US', 'United States')
    df = df[df['country'].isin(country_list)].reset_index(drop=True)

    df['year'] = df['date'].dt.year
    df = df.set_index(['date', 'country', 'year']).stack().reset_index().rename(columns={'level_3': 'type', 0: 'value'})

    # 生成7日平滑数据
    df_7mean = df.copy()
    df_7mean['value'] = df_7mean.groupby(['country', 'type'])['value'].transform(
        lambda x: x.rolling(window=7, min_periods=1).mean())

    # 四舍五入到2位小数
    df_7mean['value'] = round(df_7mean['value'], 2)
    # 输出
    df.to_csv(os.path.join(file_path, 'data_for_download.csv'), index=False, encoding='utf_8_sig')
    df_7mean.to_csv(os.path.join(file_path, 'data_for_line_chart.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给stacked area用的
    df_7mean = df_7mean[~df_7mean['type'].isin(['fossil', 'renewables', 'total'])].reset_index(drop=True)
    df_7mean['total'] = df_7mean.groupby(['country', 'date'])['value'].transform('sum')
    df_7mean['percentage'] = (df_7mean['value'] / df_7mean['total']) * 100

    df_7mean.to_csv(os.path.join(file_path, 'data_for_stacked_area_chart.csv'), index=False, encoding='utf_8_sig')


def git_push(repo_path, commit_message="Automated commit"):
    try:
        os.chdir(repo_path)

        # Pull the latest changes from the remote repository
        subprocess.run(['git', 'pull'])

        subprocess.run(['git', 'add', '--all'])
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
        print("Changes pulled and pushed successfully.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
